const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// WebSocket server on port 8080
const wss = new WebSocket.Server({ port: 8080 });

let serialPort = null;
let parser = null;
let connectedClients = new Set();

// Store recent logs
let logBuffer = [];
const MAX_LOGS = 1000;

// Store accumulated sensor data between readings
let currentSensorData = {};

// Parse sensor data from serial output
function parseSensorData(line) {
    const data = {
        timestamp: new Date().toISOString(),
        raw: line
    };

    // Parse acceleration values
    if (line.includes('Acceleration X:')) {
        const match = line.match(/Acceleration X:\s*([-\d.]+)/);
        if (match) {
            currentSensorData.accelX = parseFloat(match[1]);
            data.accelX = currentSensorData.accelX;
        }
    }
    if (line.includes('Acceleration Y:')) {
        const match = line.match(/Acceleration Y:\s*([-\d.]+)/);
        if (match) {
            currentSensorData.accelY = parseFloat(match[1]);
            data.accelY = currentSensorData.accelY;
        }
    }
    if (line.includes('Acceleration Z:')) {
        const match = line.match(/Acceleration Z:\s*([-\d.]+)/);
        if (match) {
            currentSensorData.accelZ = parseFloat(match[1]);
            data.accelZ = currentSensorData.accelZ;
        }
    }

    // Parse gyro values
    if (line.includes('Gyro X:')) {
        const match = line.match(/Gyro X:\s*([-\d.]+)/);
        if (match) {
            currentSensorData.gyroX = parseFloat(match[1]);
            data.gyroX = currentSensorData.gyroX;
        }
    }
    if (line.includes('Gyro Y:')) {
        const match = line.match(/Gyro Y:\s*([-\d.]+)/);
        if (match) {
            currentSensorData.gyroY = parseFloat(match[1]);
            data.gyroY = currentSensorData.gyroY;
        }
    }
    if (line.includes('Gyro Z:')) {
        const match = line.match(/Gyro Z:\s*([-\d.]+)/);
        if (match) {
            currentSensorData.gyroZ = parseFloat(match[1]);
            data.gyroZ = currentSensorData.gyroZ;
        }
    }

    // Parse temperature
    if (line.includes('Temperature:')) {
        const match = line.match(/Temperature:\s*([-\d.]+)/);
        if (match) {
            currentSensorData.temperature = parseFloat(match[1]);
            data.temperature = currentSensorData.temperature;
        }
    }
    
    // When we see the separator, send complete sensor data
    if (line.includes('---') && Object.keys(currentSensorData).length > 0) {
        data.type = 'sensor';
        data.sensorData = { ...currentSensorData };
    }

    // Parse JSON messages
    if (line.includes('Publishing to AWS IoT:')) {
        try {
            const jsonStr = line.substring(line.indexOf('{'));
            const jsonData = JSON.parse(jsonStr);
            data.sensorData = jsonData;
            data.type = 'sensor';
        } catch (e) {
            // Not valid JSON
        }
    }

    // Detect alarm states
    if (line.includes('Alarm ON')) {
        data.type = 'alarm';
        data.alarmState = 'on';
    } else if (line.includes('Alarm OFF')) {
        data.type = 'alarm';
        data.alarmState = 'off';
    } else if (line.includes('Alarm stopped by button')) {
        data.type = 'alarm';
        data.alarmState = 'off';
        data.source = 'button';
    }

    // Connection status
    if (line.includes('Connected to AWS IoT')) {
        data.type = 'connection';
        data.connected = true;
        data.service = 'AWS IoT';
    } else if (line.includes('Connected!') && line.includes('WiFi')) {
        data.type = 'connection';
        data.connected = true;
        data.service = 'WiFi';
    }

    return data;
}

// Broadcast to all connected WebSocket clients
function broadcast(data) {
    const message = JSON.stringify(data);
    connectedClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// List available serial ports
app.get('/api/ports', async (req, res) => {
    try {
        const ports = await SerialPort.list();
        res.json(ports);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Connect to serial port
app.post('/api/connect', (req, res) => {
    const { port, baudRate = 115200 } = req.body;

    if (serialPort && serialPort.isOpen) {
        serialPort.close();
    }

    try {
        serialPort = new SerialPort({
            path: port,
            baudRate: baudRate
        });

        parser = serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));

        parser.on('data', (line) => {
            console.log('Serial:', line);
            
            // Add to log buffer
            logBuffer.push({
                timestamp: new Date().toISOString(),
                data: line
            });
            if (logBuffer.length > MAX_LOGS) {
                logBuffer.shift();
            }

            // Parse and broadcast
            const parsedData = parseSensorData(line);
            
            // Debug: Log parsed sensor data
            if (parsedData.type === 'sensor') {
                console.log('Parsed sensor data:', parsedData.sensorData);
            }
            
            broadcast(parsedData);
        });

        serialPort.on('error', (err) => {
            console.error('Serial port error:', err);
            broadcast({ type: 'error', message: err.message });
        });

        res.json({ success: true, message: `Connected to ${port}` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Send command to ESP32
app.post('/api/command', (req, res) => {
    const { command } = req.body;

    if (!serialPort || !serialPort.isOpen) {
        return res.status(400).json({ error: 'Serial port not connected' });
    }

    // Format command as JSON for ESP32
    const jsonCommand = JSON.stringify(command);
    serialPort.write(jsonCommand + '\n', (err) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ success: true });
        }
    });
});

// Get recent logs
app.get('/api/logs', (req, res) => {
    res.json(logBuffer);
});

// WebSocket connection handler
wss.on('connection', (ws) => {
    console.log('WebSocket client connected');
    connectedClients.add(ws);

    // Send recent logs to new client
    ws.send(JSON.stringify({
        type: 'history',
        logs: logBuffer.slice(-100)
    }));

    ws.on('close', () => {
        console.log('WebSocket client disconnected');
        connectedClients.delete(ws);
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        connectedClients.delete(ws);
    });
});

// Start HTTP server for API
app.listen(3001, () => {
    console.log('Serial bridge API running on http://localhost:3001');
    console.log('WebSocket server running on ws://localhost:8080');
    console.log('\nEndpoints:');
    console.log('  GET  /api/ports    - List available serial ports');
    console.log('  POST /api/connect  - Connect to serial port');
    console.log('  POST /api/command  - Send command to ESP32');
    console.log('  GET  /api/logs     - Get recent logs');
});