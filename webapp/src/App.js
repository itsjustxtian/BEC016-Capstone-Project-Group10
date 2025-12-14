import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import html2canvas from 'html2canvas';

function App() {
  const [sensorData, setSensorData] = useState({
    accelX: 0,
    accelY: 0,
    accelZ: 9.80665,
    gyroX: 0,
    gyroY: 0,
    gyroZ: 0,
    temperature: 24
  });
  const [earthquakeStatus, setEarthquakeStatus] = useState('off');
  const [dataHistory, setDataHistory] = useState([]);
  const [isSimulating, setIsSimulating] = useState(false); // Start with simulation off
  const [viewWindow, setViewWindow] = useState(10000); // Default 10 second view window
  const [connectionMode, setConnectionMode] = useState('simulation'); // 'simulation' or 'serial'
  const [alarmSound, setAlarmSound] = useState(true); // Enable/disable sound
  const [currentIntensity, setCurrentIntensity] = useState(0); // Real-time intensity
  const [peakIntensity, setPeakIntensity] = useState(0); // Peak intensity for current session
  const [serialPorts, setSerialPorts] = useState([]);
  const [selectedPort, setSelectedPort] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [logs, setLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(true);
  const [earthquakeHistory, setEarthquakeHistory] = useState([]);
  const [showEarthquakeModal, setShowEarthquakeModal] = useState(false);
  const wsRef = useRef(null);
  const logsEndRef = useRef(null);
  const currentEarthquakeRef = useRef(null);

  // Auto-scroll logs to bottom
  // Removed auto-scroll behavior to prevent forced scrolling

  // WebSocket connection for real ESP32 data
  useEffect(() => {
    if (connectionMode === 'serial') {
      wsRef.current = new WebSocket('ws://localhost:8080');
      
      wsRef.current.onopen = () => {
        console.log('WebSocket connected');
        addLog('WebSocket connected to serial bridge', 'info');
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Debug log
          console.log('WebSocket received:', data);
          
          // Handle different message types
          if (data.type === 'sensor' && data.sensorData) {
            console.log('Updating sensor data:', data.sensorData);
            setSensorData(data.sensorData);
            setDataHistory(prev => {
              const newHistory = [...prev, {
                time: new Date().toLocaleTimeString(),
                ...data.sensorData
              }];
              return newHistory.slice(-30);
            });
          } else if (data.type === 'alarm') {
            setEarthquakeStatus(data.alarmState);
            addLog(`Alarm ${data.alarmState.toUpperCase()}${data.source ? ' (by ' + data.source + ')' : ''}`, 'alarm');
          } else if (data.type === 'connection') {
            addLog(`Connected to ${data.service}`, 'success');
          } else if (data.type === 'history') {
            // Load historical logs
            data.logs.forEach(log => {
              addLog(log.data, 'serial');
            });
          }
          
          // Always add raw serial data to logs
          if (data.raw) {
            addLog(data.raw, 'serial');
          }
        } catch (error) {
          console.error('WebSocket message parse error:', error);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        addLog('WebSocket error - Make sure serial bridge is running', 'error');
      };

      wsRef.current.onclose = () => {
        console.log('WebSocket disconnected');
        addLog('WebSocket disconnected', 'warning');
        setIsConnected(false);
      };

      return () => {
        if (wsRef.current) {
          wsRef.current.close();
        }
      };
    }
  }, [connectionMode]);

  // Fetch available serial ports
  const fetchSerialPorts = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/ports');
      const ports = await response.json();
      setSerialPorts(ports);
      addLog(`Found ${ports.length} serial ports`, 'info');
    } catch (error) {
      addLog('Failed to fetch serial ports - Is serial bridge running?', 'error');
      console.error('Failed to fetch ports:', error);
    }
  };

  // Connect to selected serial port
  const connectToSerial = async () => {
    if (!selectedPort) {
      addLog('Please select a serial port', 'warning');
      return;
    }

    try {
      const response = await fetch('http://localhost:3001/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ port: selectedPort, baudRate: 115200 })
      });

      const result = await response.json();
      if (result.success) {
        setIsConnected(true);
        addLog(`Connected to ${selectedPort}`, 'success');
      } else {
        addLog(`Failed to connect: ${result.error}`, 'error');
      }
    } catch (error) {
      addLog(`Connection error: ${error.message}`, 'error');
      console.error('Connection error:', error);
    }
  };

  // Add log entry
  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev.slice(-500), { timestamp, message, type }]);
  };

  // Store previous values for smooth transitions
  const prevDataRef = useRef({
    accelX: 0,
    accelY: 0,
    accelZ: 9.80665,
    gyroX: 0,
    gyroY: 0,
    gyroZ: 0
  });

  // Create refs for earthquake control
  const earthquakeControlRef = useRef({
    intensity: 0,
    decay: 0,
    phase: 0,
    alarmDeactivated: false
  });

  // Play alarm sound effect
  const playAlarmSound = () => {
    if (alarmSound) {
      // Create a simple alarm sound using Web Audio API
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 2093; // Same frequency as ESP32 buzzer
      oscillator.type = 'square';
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    }
  };

  // Trigger alarm effects
  useEffect(() => {
    if (earthquakeStatus === 'on') {
      playAlarmSound();
      const interval = setInterval(playAlarmSound, 1000); // Beep every second
      return () => clearInterval(interval);
    }
  }, [earthquakeStatus, alarmSound]);

  // Simulate sensor data
  useEffect(() => {
    if (connectionMode === 'simulation' && isSimulating) {
      // Simulate realistic ESP32 + MPU6050 data
      let deviceTilt = { x: 0, y: 0 }; // Device orientation
      
      const generateData = () => {
        // Simulate small device movement/tilt
        deviceTilt.x += (Math.random() - 0.5) * 0.02;
        deviceTilt.y += (Math.random() - 0.5) * 0.02;
        deviceTilt.x = Math.max(-0.5, Math.min(0.5, deviceTilt.x));
        deviceTilt.y = Math.max(-0.5, Math.min(0.5, deviceTilt.y));
        
        // Base gravity vector adjusted for device tilt
        const baseAccelX = -deviceTilt.y * 9.80665;
        const baseAccelY = deviceTilt.x * 9.80665;
        const baseAccelZ = Math.sqrt(Math.max(0, 96.17 - baseAccelX * baseAccelX - baseAccelY * baseAccelY));
        
        // Random chance of earthquake (2% per second)
        if (Math.random() > 0.98 && earthquakeControlRef.current.intensity === 0) {
          if (earthquakeControlRef.current.intensity === 0) {
            // Generate earthquakes between magnitude 1-10 for realism
            earthquakeControlRef.current.intensity = 1 + Math.random() * 9;
            earthquakeControlRef.current.decay = 0.85 + Math.random() * 0.1; // Decay rate
            earthquakeControlRef.current.alarmDeactivated = false; // Reset alarm deactivation flag
            
            // Start tracking new earthquake
            currentEarthquakeRef.current = {
              startTime: new Date(),
              peakMagnitude: earthquakeControlRef.current.intensity,
              data: []
            };
            
            // Update peak intensity
            setPeakIntensity(prev => Math.max(prev, earthquakeControlRef.current.intensity));
            
            // Only trigger alarm for magnitude 3.0 or higher (felt by people)
            if (earthquakeControlRef.current.intensity >= 3.0) {
              addLog(`Earthquake detected! Magnitude: ${earthquakeControlRef.current.intensity.toFixed(1)}`, 'alarm');
              setEarthquakeStatus('on'); // Trigger alarm
            } else {
              // Minor earthquake - log but don't alarm
              addLog(`Minor tremor detected. Magnitude: ${earthquakeControlRef.current.intensity.toFixed(1)} (Too weak to trigger alarm)`, 'info');
            }
          }
        }
        
        // Earthquake vibration pattern
        let quakeAccelX = 0, quakeAccelY = 0, quakeAccelZ = 0;
        let quakeGyroX = 0, quakeGyroY = 0, quakeGyroZ = 0;
        
        if (earthquakeControlRef.current.intensity > 0.1) {
          earthquakeControlRef.current.phase += 0.5 + Math.random() * 0.5;
          
          // P-wave (vertical motion)
          quakeAccelZ = Math.sin(earthquakeControlRef.current.phase * 3.14) * earthquakeControlRef.current.intensity * 0.7;
          
          // S-wave (horizontal motion)
          quakeAccelX = Math.sin(earthquakeControlRef.current.phase * 2.5) * earthquakeControlRef.current.intensity;
          quakeAccelY = Math.cos(earthquakeControlRef.current.phase * 2.8) * earthquakeControlRef.current.intensity * 0.8;
          
          // Rotational motion during earthquake
          quakeGyroX = Math.sin(earthquakeControlRef.current.phase * 4) * earthquakeControlRef.current.intensity * 10;
          quakeGyroY = Math.cos(earthquakeControlRef.current.phase * 3.5) * earthquakeControlRef.current.intensity * 8;
          quakeGyroZ = Math.sin(earthquakeControlRef.current.phase * 3) * earthquakeControlRef.current.intensity * 5;
          
          // Track earthquake data
          if (currentEarthquakeRef.current) {
            currentEarthquakeRef.current.data.push({
              timestamp: new Date(),
              magnitude: earthquakeControlRef.current.intensity,
              accelX: baseAccelX + quakeAccelX,
              accelY: baseAccelY + quakeAccelY,
              accelZ: baseAccelZ + quakeAccelZ
            });
            // Update peak magnitude
            if (earthquakeControlRef.current.intensity > currentEarthquakeRef.current.peakMagnitude) {
              currentEarthquakeRef.current.peakMagnitude = earthquakeControlRef.current.intensity;
            }
          }
          
          // Decay earthquake
          earthquakeControlRef.current.intensity *= earthquakeControlRef.current.decay;
          setCurrentIntensity(earthquakeControlRef.current.intensity); // Update state for UI
          
          // Track peak intensity
          if (earthquakeControlRef.current.intensity > peakIntensity) {
            setPeakIntensity(earthquakeControlRef.current.intensity);
          }
          
          if (earthquakeControlRef.current.intensity < 0.1) {
            // Save earthquake to history
            if (currentEarthquakeRef.current) {
              const earthquake = {
                ...currentEarthquakeRef.current,
                endTime: new Date(),
                duration: (new Date() - currentEarthquakeRef.current.startTime) / 1000 // seconds
              };
              setEarthquakeHistory(prev => [...prev, earthquake].slice(-50)); // Keep last 50 earthquakes
              currentEarthquakeRef.current = null;
            }
            
            earthquakeControlRef.current.intensity = 0;
            earthquakeControlRef.current.phase = 0;
            earthquakeControlRef.current.alarmDeactivated = false;
            if (earthquakeStatus === 'on') {
              setEarthquakeStatus('off');
            }
            setCurrentIntensity(0);
            addLog('Seismic activity ended', 'info');
          } else if (earthquakeControlRef.current.intensity < 3.0 && !earthquakeControlRef.current.alarmDeactivated && earthquakeStatus === 'on') {
            // Turn off alarm if intensity drops below 3.0 (only once per earthquake)
            setEarthquakeStatus('off');
            earthquakeControlRef.current.alarmDeactivated = true;
            addLog(`Magnitude dropped below 3.0 (current: ${earthquakeControlRef.current.intensity.toFixed(1)}), alarm deactivated`, 'info');
          } else if (earthquakeControlRef.current.intensity >= 3.0 && earthquakeControlRef.current.alarmDeactivated) {
            // Re-activate alarm if intensity goes back above 3.0
            setEarthquakeStatus('on');
            earthquakeControlRef.current.alarmDeactivated = false;
          }
        } else {
          // No earthquake activity - ensure magnitude shows 0.0
          if (currentIntensity !== 0) {
            setCurrentIntensity(0);
          }
        }
        
        // Normal sensor noise (MPU6050 typical noise levels)
        const noiseAccel = 0.05; // ±0.05 m/s² noise
        const noiseGyro = 0.5;   // ±0.5 °/s noise
        
        // Combine all components
        const newData = {
          accelX: baseAccelX + quakeAccelX + (Math.random() - 0.5) * noiseAccel,
          accelY: baseAccelY + quakeAccelY + (Math.random() - 0.5) * noiseAccel,
          accelZ: baseAccelZ + quakeAccelZ + (Math.random() - 0.5) * noiseAccel,
          gyroX: quakeGyroX + (Math.random() - 0.5) * noiseGyro,
          gyroY: quakeGyroY + (Math.random() - 0.5) * noiseGyro,
          gyroZ: quakeGyroZ + (Math.random() - 0.5) * noiseGyro,
          temperature: 24.5 + Math.sin(Date.now() / 30000) * 2 + (Math.random() - 0.5) * 0.2
        };

        prevDataRef.current = newData;
        setSensorData(newData);

        setDataHistory(prev => {
          const now = new Date();
          const newEntry = {
            time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            timestamp: now.getTime(),
            ...newData
          };
          
          const newHistory = [...prev, newEntry];
          
          // Keep enough data for the largest view window (1 day = 86400 points)
          // Limit to 86400 points to prevent memory issues
          return newHistory.slice(-86400);
        });
      };

      // Generate first data point after 1 second
      const timeout = setTimeout(() => {
        generateData();
      }, 1000);

      // Then continue every second
      const interval = setInterval(() => {
        generateData();
      }, 1000);

      return () => {
        clearTimeout(timeout);
        clearInterval(interval);
      };
    }
  }, [isSimulating, connectionMode]);

  const handleAlarmOn = async () => {
    setEarthquakeStatus('on');
    addLog('Manual alarm activation', 'alarm');

    if (connectionMode === 'serial' && isConnected) {
      try {
        await fetch('http://localhost:3001/api/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            command: { message: "Manual alarm ON", earthquake: "on" }
          })
        });
      } catch (error) {
        console.error('Failed to send command:', error);
      }
    }
  };

  const handleAlarmOff = async () => {
    setEarthquakeStatus('off');
    addLog('Manual alarm deactivation', 'info');

    if (connectionMode === 'serial' && isConnected) {
      try {
        await fetch('http://localhost:3001/api/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            command: { message: "Manual alarm OFF", earthquake: "off" }
          })
        });
      } catch (error) {
        console.error('Failed to send command:', error);
      }
    }
  };

  const handleSimulateEarthquake = () => {
    // Trigger earthquake through the ref that the simulation uses
    if (connectionMode === 'simulation' && isSimulating) {
      const intensity = 5 + Math.random() * 5; // Magnitude 5-10 for manual
      earthquakeControlRef.current.intensity = intensity;
      earthquakeControlRef.current.decay = 0.92; // Slower decay for manual trigger
      earthquakeControlRef.current.phase = 0;
      earthquakeControlRef.current.alarmDeactivated = false;
      
      // Start tracking new earthquake
      currentEarthquakeRef.current = {
        startTime: new Date(),
        peakMagnitude: intensity,
        data: []
      };
      
      setCurrentIntensity(intensity);
      setPeakIntensity(prev => Math.max(prev, intensity)); // Update peak if needed
      setEarthquakeStatus('on');
      addLog(`Earthquake detected! Magnitude: ${intensity.toFixed(1)}`, 'alarm');
    } else {
      // If simulation is not running, just show visual feedback
      setEarthquakeStatus('on');
      addLog('Start simulation to trigger earthquake', 'warning');
      setTimeout(() => {
        setEarthquakeStatus('off');
      }, 2000);
    }
  };

  const clearLogs = () => {
    setLogs([]);
    addLog('Logs cleared', 'info');
  };
  
  const resetPeak = () => {
    setPeakIntensity(0);
    addLog('Peak intensity reset', 'info');
  };

  const exportGraphScreenshot = async () => {
    const graphElement = document.querySelector('.chart-container');
    
    if (!graphElement) {
      addLog('Graph element not found', 'error');
      return;
    }
    
    try {
      // Get computed styles to preserve exact appearance
      const computedStyle = window.getComputedStyle(graphElement);
      const bgColor = computedStyle.backgroundColor || '#1a1a1a';
      
      const canvas = await html2canvas(graphElement, {
        backgroundColor: bgColor === 'rgba(0, 0, 0, 0)' ? '#1a1a1a' : bgColor,
        removeContainer: false,
        foreignObjectRendering: false,
        scale: 1
      });
      
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `graph-${viewWindow/1000}s-${new Date().toISOString().replace(/:/g, '-')}.png`;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
        addLog(`Graph exported (${viewWindow/1000}s window)`, 'success');
      });
    } catch (error) {
      console.error('Screenshot error:', error);
      addLog(`Failed to export graph: ${error.message}`, 'error');
    }
  };

  const showEarthquakeHistory = () => {
    setShowEarthquakeModal(true);
  };

  const exportEarthquakeHistory = () => {
    if (earthquakeHistory.length === 0) {
      addLog('No earthquake history to export', 'warning');
      return;
    }
    
    // Create CSV content
    const csvContent = "data:text/csv;charset=utf-8," 
      + "Start Time,End Time,Duration (s),Peak Magnitude,Alarm Triggered\n"
      + earthquakeHistory.map(eq => {
          const startTime = new Date(eq.startTime).toLocaleString();
          const endTime = new Date(eq.endTime).toLocaleString();
          const alarmTriggered = eq.peakMagnitude >= 3.0 ? 'Yes' : 'No';
          return `"${startTime}","${endTime}",${eq.duration.toFixed(1)},${eq.peakMagnitude.toFixed(2)},${alarmTriggered}`;
        }).join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `earthquake-history-${new Date().toISOString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addLog(`Earthquake history exported (${earthquakeHistory.length} events)`, 'success');
  };

  const exportDetailedEarthquakeData = (earthquake) => {
    // Export detailed data for a specific earthquake
    const csvContent = "data:text/csv;charset=utf-8," 
      + "Timestamp,Magnitude,AccelX,AccelY,AccelZ\n"
      + earthquake.data.map(d => 
          `"${new Date(d.timestamp).toISOString()}",${d.magnitude.toFixed(3)},${d.accelX.toFixed(3)},${d.accelY.toFixed(3)},${d.accelZ.toFixed(3)}`
        ).join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `earthquake-detail-${new Date(earthquake.startTime).toISOString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addLog('Detailed earthquake data exported', 'success');
  };

  const exportCSVData = () => {
    // Export data history as CSV
    const csvContent = "data:text/csv;charset=utf-8," 
      + "Time,AccelX,AccelY,AccelZ,GyroX,GyroY,GyroZ,Temperature\n"
      + dataHistory.map(d => 
          `${d.time},${d.accelX?.toFixed(3) || ''},${d.accelY?.toFixed(3) || ''},${d.accelZ?.toFixed(3) || ''},${d.gyroX?.toFixed(3) || ''},${d.gyroY?.toFixed(3) || ''},${d.gyroZ?.toFixed(3) || ''},${d.temperature?.toFixed(2) || ''}`
        ).join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `sensor-data-${new Date().toISOString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addLog(`Data exported as CSV (${dataHistory.length} samples)`, 'success');
  };

  // Filter data based on view window
  const getDisplayData = () => {
    if (dataHistory.length === 0) return [];
    
    const now = Date.now();
    const cutoffTime = now - viewWindow;
    
    // Filter data points within the view window
    const filtered = dataHistory.filter(point => 
      point.timestamp && point.timestamp >= cutoffTime
    );
    
    // If we have data, return it; otherwise show all available data
    return filtered.length > 0 ? filtered : dataHistory.slice(-(viewWindow / 1000));
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Earthquake Monitoring System</h1>
        <div className="header-controls">
          <select 
            value={connectionMode} 
            onChange={(e) => setConnectionMode(e.target.value)}
            className="mode-selector"
          >
            <option value="simulation">Simulation Mode</option>
            <option value="serial">ESP32 Serial Mode</option>
          </select>
          
          {connectionMode === 'simulation' && (
            <>
              <label className="simulation-toggle">
                <input
                  type="checkbox"
                  checked={isSimulating}
                  onChange={(e) => {
                    setIsSimulating(e.target.checked);
                    if (!e.target.checked) {
                      setDataHistory([]); // Clear history when stopping
                    }
                  }}
                />
                Live Simulation
              </label>
            </>
          )}
          
          {connectionMode === 'serial' && (
            <div className="connection-status">
              {isConnected ? 'Connected' : 'Disconnected'}
            </div>
          )}
        </div>
      </header>

      {connectionMode === 'serial' && (
        <div className="serial-controls">
          <button onClick={fetchSerialPorts} className="btn btn-secondary">
            Scan Ports
          </button>
          <select 
            value={selectedPort} 
            onChange={(e) => setSelectedPort(e.target.value)}
            className="port-selector"
          >
            <option value="">Select Port...</option>
            {serialPorts.map(port => (
              <option key={port.path} value={port.path}>
                {port.path} {port.manufacturer && `(${port.manufacturer})`}
              </option>
            ))}
          </select>
          <button 
            onClick={connectToSerial} 
            disabled={!selectedPort || isConnected}
            className="btn btn-primary"
          >
            Connect
          </button>
          <div className="serial-info">
            Make sure to run: <code>cd serial-bridge && npm install && npm start</code>
          </div>
        </div>
      )}

      <div className="dashboard">
        <div className={`control-panel ${earthquakeStatus === 'on' ? 'alarm-active' : ''}`}>
          <h2>Alarm Control</h2>
          {earthquakeStatus === 'on' && (
            <div className="alarm-indicator">
              <div className="alarm-led"></div>
              <div className="alarm-text">⚠ EARTHQUAKE DETECTED ⚠</div>
            </div>
          )}
          <div className="alarm-status">
            Status: <span className={earthquakeStatus === 'on' ? 'alarm-on' : 'alarm-off'}>
              {earthquakeStatus === 'on' ? 'ACTIVE' : 'INACTIVE'}
            </span>
          </div>
          <div className="sound-toggle">
            <label>
              <input
                type="checkbox"
                checked={alarmSound}
                onChange={(e) => setAlarmSound(e.target.checked)}
              />
              Sound Alarm
            </label>
          </div>
          <div className="button-group">
            <button onClick={handleAlarmOn} className="btn btn-danger">
              Activate Alarm
            </button>
            <button onClick={handleAlarmOff} className="btn btn-success">
              Deactivate Alarm
            </button>
            {connectionMode === 'simulation' && (
              <button onClick={handleSimulateEarthquake} className="btn btn-warning">
                Simulate Earthquake
              </button>
            )}
          </div>
        </div>

        <div className="sensor-data">
          <h2>Live Sensor Readings</h2>
          <div className="data-grid">
            <div className="data-item">
              <span className="label">Accel X:</span>
              <span className="value">{sensorData.accelX.toFixed(3)} m/s²</span>
            </div>
            <div className="data-item">
              <span className="label">Accel Y:</span>
              <span className="value">{sensorData.accelY.toFixed(3)} m/s²</span>
            </div>
            <div className="data-item">
              <span className="label">Accel Z:</span>
              <span className="value">{sensorData.accelZ.toFixed(3)} m/s²</span>
            </div>
            <div className="data-item">
              <span className="label">Gyro X:</span>
              <span className="value">{sensorData.gyroX.toFixed(3)} °/s</span>
            </div>
            <div className="data-item">
              <span className="label">Gyro Y:</span>
              <span className="value">{sensorData.gyroY.toFixed(3)} °/s</span>
            </div>
            <div className="data-item">
              <span className="label">Gyro Z:</span>
              <span className="value">{sensorData.gyroZ.toFixed(3)} °/s</span>
            </div>
            <div className="data-item">
              <span className="label">Temperature:</span>
              <span className="value">{sensorData.temperature.toFixed(1)} °C</span>
            </div>
          </div>
        </div>

        <div className="chart-container">
          <div className="chart-header">
            <h2>Acceleration History</h2>
            <div className="chart-controls">
              <select
                value={viewWindow}
                onChange={(e) => setViewWindow(Number(e.target.value))}
                className="window-selector"
              >
                <option value={10000}>Last 10 seconds</option>
                <option value={30000}>Last 30 seconds</option>
                <option value={60000}>Last 1 minute</option>
                <option value={300000}>Last 5 minutes</option>
                <option value={600000}>Last 10 minutes</option>
                <option value={1800000}>Last 30 minutes</option>
                <option value={3600000}>Last 1 hour</option>
                <option value={18000000}>Last 5 hours</option>
                <option value={36000000}>Last 10 hours</option>
                <option value={86400000}>Last 24 hours</option>
              </select>
              <button onClick={exportGraphScreenshot} className="btn btn-secondary" title="Export graph as image">
                Screenshot
              </button>
              <button onClick={exportCSVData} className="btn btn-secondary" title="Export data as CSV">
                Export CSV
              </button>
            </div>
          </div>
          <div className="graph-container">
            {dataHistory.length > 0 && (
              <ResponsiveContainer width="100%" height={300}>
              <LineChart data={getDisplayData()}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis 
                  dataKey="time" 
                  stroke="rgba(255,255,255,0.5)"
                  tick={{ fill: '#808080', fontSize: 10 }}
                  interval={viewWindow <= 10000 ? 0 : viewWindow <= 30000 ? 4 : viewWindow <= 60000 ? 9 : 29}
                  angle={viewWindow <= 30000 ? -45 : -45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis 
                  domain={[-20, 20]}
                  stroke="rgba(255,255,255,0.5)"
                  tick={{ fill: '#808080' }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'rgba(26, 26, 26, 0.95)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '8px'
                  }}
                  itemStyle={{ color: '#e0e0e0' }}
                />
                <Legend 
                  wrapperStyle={{ color: '#e0e0e0' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="accelX" 
                  stroke="#ff6b6b" 
                  name="Accel X" 
                  strokeWidth={2}
                  dot={false}
                  animationDuration={0}
                />
                <Line 
                  type="monotone" 
                  dataKey="accelY" 
                  stroke="#4ecdc4" 
                  name="Accel Y" 
                  strokeWidth={2}
                  dot={false}
                  animationDuration={0}
                />
                <Line 
                  type="monotone" 
                  dataKey="accelZ" 
                  stroke="#95e77e" 
                  name="Accel Z" 
                  strokeWidth={2}
                  dot={false}
                  animationDuration={0}
                />
              </LineChart>
            </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="logs-container">
          <div className="logs-header">
            <h2>Monitoring Dashboard</h2>
            <div className="logs-controls">
              <button onClick={clearLogs} className="btn btn-secondary">
                Clear Logs
              </button>
              <button 
                onClick={showEarthquakeHistory} 
                className={`btn ${currentIntensity > 0.1 ? 'btn-alarm' : 'btn-secondary'}`}
                title="View earthquake history"
              >
                Earthquake History ({earthquakeHistory.length})
              </button>
            </div>
          </div>
          <div className="monitoring-dashboard">
              <div className="logs-column">
                <h3>Serial Monitor / Logs</h3>
                <div className="logs-display">
                  {logs.map((log, index) => (
                    <div key={index} className={`log-entry log-${log.type}`}>
                      <span className="log-time">[{log.timestamp}]</span>
                      <span className="log-message">{log.message}</span>
                    </div>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              </div>
              <div className="intensity-column">
                <h3>Real-Time Intensity</h3>
                <div className="intensity-display">
                  <div className="intensity-meter">
                    <div className="intensity-value">
                      {currentIntensity > 0.1 
                        ? currentIntensity.toFixed(1) 
                        : '0.0'}
                    </div>
                    <div className="intensity-label">Magnitude</div>
                    <div className="intensity-bar-container">
                      <div 
                        className="intensity-bar" 
                        style={{ 
                          height: `${Math.min(100, currentIntensity * 10)}%`,
                          backgroundColor: currentIntensity > 7 ? '#ff0000' : 
                                           currentIntensity > 4 ? '#ff9900' : 
                                           currentIntensity > 2 ? '#ffff00' : '#00ff00'
                        }}
                      ></div>
                    </div>
                    <div className="intensity-scale">
                      <span>0</span>
                      <span>5</span>
                      <span>10</span>
                    </div>
                  </div>
                  <div className="intensity-info">
                    <div className="info-item">
                      <span className="info-label">Status:</span>
                      <span className={`info-value ${currentIntensity > 0.1 ? 'active' : ''}`}>
                        {currentIntensity > 0.1 ? 'DETECTING' : 'NORMAL'}
                      </span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Level:</span>
                      <span className="info-value">
                        {currentIntensity >= 7 ? 'MAJOR' :
                         currentIntensity >= 5 ? 'MODERATE' :
                         currentIntensity >= 4 ? 'LIGHT' :
                         currentIntensity >= 3 ? 'MINOR' :
                         currentIntensity >= 2.5 ? 'NOT FELT' :
                         currentIntensity > 0.1 ? 'MICRO' : 'NONE'}
                      </span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Alarm:</span>
                      <span className="info-value">
                        {currentIntensity >= 3.0 ? 'TRIGGERED' : 
                         currentIntensity > 0.1 ? 'BELOW THRESHOLD' : 'READY'}
                      </span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Peak:</span>
                      <span className="info-value">
                        {peakIntensity > 0 
                          ? peakIntensity.toFixed(1)
                          : '(No Activity)'}
                      </span>
                      {peakIntensity > 0 && (
                        <button 
                          className="btn-reset-peak" 
                          onClick={resetPeak}
                          title="Reset peak value"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
        </div>
      </div>
      
      {/* Earthquake History Modal */}
      {showEarthquakeModal && (
        <div className="modal-overlay" onClick={() => setShowEarthquakeModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Earthquake Activity History</h2>
              <button className="modal-close" onClick={() => setShowEarthquakeModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {earthquakeHistory.length === 0 ? (
                <p className="no-data">No earthquake activities recorded yet.</p>
              ) : (
                <>
                  <div className="earthquake-stats">
                    <div className="stat-item">
                      <span className="stat-label">Total Events:</span>
                      <span className="stat-value">{earthquakeHistory.length}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Alarm Triggered:</span>
                      <span className="stat-value">
                        {earthquakeHistory.filter(eq => eq.peakMagnitude >= 3.0).length}
                      </span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Max Magnitude:</span>
                      <span className="stat-value">
                        {earthquakeHistory.length > 0 
                          ? Math.max(...earthquakeHistory.map(eq => eq.peakMagnitude)).toFixed(1)
                          : '0.0'}
                      </span>
                    </div>
                  </div>
                  <div className="earthquake-list">
                    <table>
                      <thead>
                        <tr>
                          <th>Start Time</th>
                          <th>Duration</th>
                          <th>Peak Magnitude</th>
                          <th>Alarm</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {earthquakeHistory.slice().reverse().map((eq, index) => (
                          <tr key={index} className={eq.peakMagnitude >= 3.0 ? 'alarm-triggered' : ''}>
                            <td>{new Date(eq.startTime).toLocaleString()}</td>
                            <td>{eq.duration.toFixed(1)}s</td>
                            <td className="magnitude">{eq.peakMagnitude.toFixed(2)}</td>
                            <td>{eq.peakMagnitude >= 3.0 ? 'Yes' : 'No'}</td>
                            <td>
                              <button 
                                className="btn-small"
                                onClick={() => exportDetailedEarthquakeData(eq)}
                                title="Export detailed data"
                              >
                                Export
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={exportEarthquakeHistory}>
                Export All as CSV
              </button>
              <button className="btn btn-secondary" onClick={() => setShowEarthquakeModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;