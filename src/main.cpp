#include <Arduino.h>
// Include the required libraries
#include <WiFi.h>                // Provides functions to connect the ESP32 to a WiFi network
#include <WiFiClientSecure.h>    // Enables secure (SSL/TLS) communication, required for AWS IoT
#include <PubSubClient.h>        // Handles MQTT protocol (publish-subscribe model)
#include "secrets.h"             // Custom header file that stores WiFi and AWS credentials (keeps them separate from main code)
#include <Adafruit_MPU6050.h>    // MPU6050 accelerometer and gyroscope library
#include <Adafruit_Sensor.h>     // Unified sensor library
#include <Wire.h>                // I2C communication library
#include <ArduinoJson.h>         // Creating and parsing JSON Document

#define AWS_IOT_PUBLISH_TOPIC "devices/" AWS_IOT_CLIENT_ID "/data" // Topic to publish sensor data to AWS IoT Core
#define AWS_IOT_SUBSCRIBE_TOPIC  "devices/" AWS_IOT_CLIENT_ID "/commands" // Topic to be subscribe by the ESP32

// MPU6050 sensor object
Adafruit_MPU6050 mpu;

WiFiClientSecure net;

PubSubClient client(net);

// Sensor data variables
float accelX, accelY, accelZ;
float gyroX, gyroY, gyroZ;
float temperature;


unsigned long lastPublishTime = 0;       // Stores last publish timestamp
const long publishInterval = 2000;       // Interval in milliseconds (2 seconds)
                                          // Publishing interval for MPU6050 sensor data

void connectToWiFi() {
    // Print a message to the Serial Monitor to indicate connection attempt
    Serial.print("Connecting to WiFi");

    // Set the ESP32 to Station mode (connects to an existing WiFi network)
    WiFi.mode(WIFI_STA);

    // Begin WiFi connection using SSID and Password defined in secrets.h
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    // Keep checking WiFi status until the ESP32 is connected to the network
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);          // Wait half a second before checking again
        Serial.print(".");   // Print progress indicator
    }

    // Once connected, print confirmation
    Serial.println(" Connected!");
}

// Configure and connect to AWS IoT Core using certificates
void connectToAWS() {
    // Notify user that the certificate setup is starting
    Serial.println("Configuring certificates...");
  
    // Assign AWS Root Certificate Authority (CA) to the secure WiFi client
    net.setCACert(AWS_CERT_CA);
  
    // Assign the device's own certificate (used to identify the device)
    net.setCertificate(AWS_CERT_CRT);
  
    // Assign the device's private key (used to prove the device owns the certificate)
    net.setPrivateKey(AWS_CERT_PRIVATE);

    // Configure the MQTT client to connect to the AWS IoT Core endpoint on port 8883 (secure MQTT)
    client.setServer(AWS_IOT_ENDPOINT, 8883);

    // Print a message to indicate we are now connecting to AWS IoT
    Serial.print("Connecting to AWS IoT");

    // Attempt to connect to AWS IoT using the device's "Thing Name"
    while (!client.connect(AWS_IOT_CLIENT_ID)) {
        Serial.print(".");  // Show progress
        delay(100);         // Brief pause between connection attempts
    }

    // If we still aren't connected after trying, print an error and return
    if (!client.connected()) {
        Serial.println(" Connection failed (timeout).");
        return;
    }

    // If connected successfully, notify the user
    Serial.println("\nConnected to AWS IoT!");

    // Publish a test message to a specific topic to confirm functionality
    // client.publish(("devices/" AWS_IOT_CLIENT_ID "/data"), "Hello from ESP32!");

    client.subscribe(AWS_IOT_SUBSCRIBE_TOPIC);  //Subscribes to incoming topic
}

void readSensorData() {
    // Get new sensor events from MPU6050
    sensors_event_t accel, gyro, temp;
    
    // Read sensor data from MPU6050
    mpu.getEvent(&accel, &gyro, &temp);
    
    // Store sensor readings in global variables
    accelX = accel.acceleration.x;
    accelY = accel.acceleration.y;
    accelZ = accel.acceleration.z;
    gyroX = gyro.gyro.x;
    gyroY = gyro.gyro.y;
    gyroZ = gyro.gyro.z;
    temperature = temp.temperature;
    
    // Print sensor readings to serial monitor (required for milestone)
    Serial.println("\n=== MPU6050 Sensor Readings ===");
    Serial.print("Acceleration X: "); Serial.print(accelX, 2); Serial.println(" m/s^2");
    Serial.print("Acceleration Y: "); Serial.print(accelY, 2); Serial.println(" m/s^2");
    Serial.print("Acceleration Z: "); Serial.print(accelZ, 2); Serial.println(" m/s^2");
    Serial.print("Gyro X: "); Serial.print(gyroX, 4); Serial.println(" rad/s");
    Serial.print("Gyro Y: "); Serial.print(gyroY, 4); Serial.println(" rad/s");
    Serial.print("Gyro Z: "); Serial.print(gyroZ, 4); Serial.println(" rad/s");
    Serial.print("Temperature: "); Serial.print(temperature, 2); Serial.println(" °C");
    Serial.println("---");
}

void publishMessage(){
    // Create a JSON document in memory with a 512-byte buffer capacity
    StaticJsonDocument<200> doc;

    // Add accelerometer data to the JSON payload
    doc["accelX"] = accelX;
    doc["accelY"] = accelY;
    doc["accelZ"] = accelZ;
    
    // Add gyroscope data to the JSON payload
    doc["gyroX"] = gyroX;
    doc["gyroY"] = gyroY;
    doc["gyroZ"] = gyroZ;
    
    // Add temperature to the JSON payload
    doc["temperature"] = temperature;

    // Create a buffer to store the serialized JSON string
    char jsonBuffer[256];

    // Serialize the JSON document into the buffer
    serializeJson(doc, jsonBuffer);

    // Print the JSON payload to serial monitor for debugging
    Serial.print("Publishing to AWS IoT: ");
    Serial.println(jsonBuffer);

    // Publish the JSON String to the defined AWS IoT Topic
    if (client.publish(AWS_IOT_PUBLISH_TOPIC, jsonBuffer)) {
        Serial.println("Message published successfully!");
    } else {
        Serial.println("Failed to publish message.");
    }
    Serial.println("---");
}

void messageHandler(char* topic, byte* payload, unsigned int length) {
  Serial.print("Incoming message on topic: ");
  Serial.println(topic);

  // Create a JSON document with 200 bytes capacity
  JsonDocument doc;

  // Deserialize the payload into the JSON document
  // `deserializeJson` is a function from the ArduinoJson library that converts JSON string data into a structured format.
  DeserializationError error = deserializeJson(doc, payload, length);
  if (error) {
    Serial.print("Failed to parse JSON: ");
    Serial.println(error.c_str());
    return;
  }

  // If there's a 'message' key, print its value
  if (doc["message"].is<const char*>()) {
    const char* msg = doc["message"]; // Extract the message string
    Serial.print("Message: ");
    Serial.println(msg);
  } else {
    Serial.println("No 'message' key found in payload.");
  }
}

void setup() {
    // Initialize serial communication for debugging at 115200 bits per second
    Serial.begin(115200);
    delay(1000);
  
    // Print an initial status message to the Serial Monitor
    Serial.println("Starting ESP32 AWS IoT connection...");
    
    // Initialize I2C communication
    Wire.begin();
    
    // Initialize MPU6050 sensor
    Serial.println("Initializing MPU6050 sensor...");
    if (!mpu.begin()) {
        Serial.println("Failed to find MPU6050 chip!");
        while (1) {
            delay(10);
        }
    }
    Serial.println("MPU6050 Found!");
    
    // Configure MPU6050 settings
    mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
    mpu.setGyroRange(MPU6050_RANGE_500_DEG);
    mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
    Serial.println("MPU6050 configured!");
    Serial.println("");
  
    // Call function to connect the ESP32 to WiFi
    connectToWiFi();

    // Call function to set up certificates and connect to AWS IoT Core
    connectToAWS();

    client.setCallback(messageHandler); // Register the callback function for incoming messages
}

void loop() {
    // 1. Remove all delay() lines of code

  client.loop();  // Always keep MQTT connection alive

  // Check if it's time to read sensor and publish again
  if (millis() - lastPublishTime >= publishInterval) {

    // 2. Read accelerometer and gyroscope data from MPU6050
    readSensorData();

    // publish the data to AWS IoT
    if(client.connected()){
        publishMessage();
    } else {
        Serial.println("MQTT not connected, skipping publish.");
    }

    // 3. Update lastPublishTime
    lastPublishTime = millis();
  }

  // No blocking delays — loop keeps running fast
}