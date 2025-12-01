#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include "secrets.h"
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <Wire.h>

// WiFi & MQTT clients
WiFiClientSecure net;
PubSubClient client(net);

//MPU 6050 declaration
Adafruit_MPU6050 mpu;
sensors_event_t event;

void connectToWiFi() {
  Serial.print("Connecting to WiFi...");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWiFi connected!");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());
}

void connectAWS() {
  // Load certificates
  net.setCACert(AWS_CERT_CA);
  net.setCertificate(AWS_CERT_CRT);
  net.setPrivateKey(AWS_CERT_PRIVATE);

  client.setServer(AWS_IOT_ENDPOINT, 8883);

  Serial.print("Connecting to AWS IoT Core...");

  while (!client.connected()) {
    if (client.connect(AWS_IOT_CLIENT_ID)) {
      Serial.println("\nAWS IoT Connected!");
    } else {
      Serial.print(".");
      delay(1000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  while (!mpu.begin()) {
    Serial.println("MPU6050 not connected!");
    delay(1000);
  }

  Serial.println("MPU6050 ready!");

  connectToWiFi();
  connectAWS();
}

void loop() {
  // Must keep MQTT connection alive
  if (!client.connected()) {
    connectAWS();
  }

  client.loop();
}
