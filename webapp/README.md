# Earthquake Monitoring Web App

React dashboard for the Earthquake Monitoring System with two modes:
1. **Simulation Mode** - Works without any hardware
2. **ESP32 Serial Mode** - Connects to real ESP32 via serial port

## Features

### Simulation Mode
- Live simulated sensor data
- Manual earthquake trigger button
- Auto-generates random earthquake events
- No hardware required

### ESP32 Serial Mode
- Real-time sensor data from ESP32
- Serial monitor with colored logs
- Remote alarm control
- Displays all ESP32 serial output including:
  - MPU6050 sensor readings
  - AWS IoT connection status
  - Alarm state changes
  - Debug messages

## Installation

### Web App Setup
```bash
cd webapp
npm install
npm start
```
Visit http://localhost:3000

### For ESP32 Serial Connection (Optional)
```bash
# In a separate terminal
cd serial-bridge
npm install
npm start
```

## How to Use

### Simulation Mode (Default)
1. Open the web app
2. Toggle "Live Simulation" to see continuous data
3. Click "Simulate Earthquake" to trigger an event

### ESP32 Serial Mode
1. Start the serial bridge: `cd serial-bridge && npm start`
2. Connect your ESP32 to USB
3. In the web app, select "ESP32 Serial Mode" 
4. Click "Scan Ports" to find your ESP32
5. Select the port (usually COM3 on Windows, /dev/ttyUSB0 on Linux)
6. Click "Connect"
7. View real-time data and logs

## Serial Data Format

The app parses these log patterns from main.cpp:
```
Acceleration X: -0.45 m/s^2
Gyro X: 0.0234 rad/s
Temperature: 24.56 °C
Publishing to AWS IoT: {"accelX":0.45,...}
Alarm ON/OFF
Connected to AWS IoT!
```

## Troubleshooting

- **"Failed to fetch serial ports"**: Make sure serial-bridge is running
- **No data showing**: Check ESP32 is connected and serial monitor is not open elsewhere
- **Permission denied on Linux**: Add user to dialout group: `sudo usermod -a -G dialout $USER`