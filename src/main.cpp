#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include "secrets.h"

// WiFi & MQTT clients
WiFiClientSecure net;
PubSubClient client(net);

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
