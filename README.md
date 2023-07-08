# WebhookPublisherWebSocketSubscriber
A generic Webhook callback to receive data from a interested server, and a WebSocket server that dispatches the data to WebSocket subscribers who are interested in a certain type of data.

---

### WebhookCallback (php)
create a Webhook to WebhookCallback.php?key={an identifier for this webhook data}

this Webhook will receive POST data from the interested server, and it will publish this data to **WebSocketPushServer**

---
### WebSocketPushServer (php)

put WebSocketPushServer to anywhere on the server  
and run start.sh

---

### WebSocketSubscriberClient
open index.html from browser  
and subscribe to a "key"  
whenever there is a data published with the "key" from the **WebhookCallback**, **WebSocketPushServer** will push it to this client.
