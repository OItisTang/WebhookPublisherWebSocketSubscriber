// ---------------------
// vendor
// ---------------------
function getWebsocketErrorReason(errorCode) {
	var reason = "Unknown reason";
	
	// See https://www.rfc-editor.org/rfc/rfc6455#section-7.4.1
	if (errorCode == 1000)
		reason = "Normal closure, meaning that the purpose for which the connection was established has been fulfilled.";
	else if(errorCode == 1001)
		reason = "An endpoint is \"going away\", such as a server going down or a browser having navigated away from a page.";
	else if(errorCode == 1002)
		reason = "An endpoint is terminating the connection due to a protocol error";
	else if(errorCode == 1003)
		reason = "An endpoint is terminating the connection because it has received a type of data it cannot accept (e.g., an endpoint that understands only text data MAY send this if it receives a binary message).";
	else if(errorCode == 1004)
		reason = "Reserved. The specific meaning might be defined in the future.";
	else if(errorCode == 1005)
		reason = "No status code was actually present.";
	else if(errorCode == 1006)
		reason = "The connection was closed abnormally, e.g., without sending or receiving a Close control frame";
	else if(errorCode == 1007)
		reason = "An endpoint is terminating the connection because it has received data within a message that was not consistent with the type of the message (e.g., non-UTF-8 [https://www.rfc-editor.org/rfc/rfc3629] data within a text message).";
	else if(errorCode == 1008)
		reason = "An endpoint is terminating the connection because it has received a message that \"violates its policy\". This reason is given either if there is no other sutible reason, or if there is a need to hide specific details about the policy.";
	else if(errorCode == 1009)
		reason = "An endpoint is terminating the connection because it has received a message that is too big for it to process.";
	else if(errorCode == 1010) // Note that this status code is not used by the server, because it can fail the WebSocket handshake instead.
		reason = "An endpoint (client) is terminating the connection because it has expected the server to negotiate one or more extension, but the server didn't return them in the response message of the WebSocket handshake. <br /> Specifically, the extensions that are needed are: " + event.reason;
	else if(errorCode == 1011)
		reason = "A server is terminating the connection because it encountered an unexpected condition that prevented it from fulfilling the request.";
	else if(errorCode == 1015)
		reason = "The connection was closed due to a failure to perform a TLS handshake (e.g., the server certificate can't be verified).";
	
	return reason;
}

// ---------------------
// WebSocketSubscriber: subscribe to a key for updates
// ---------------------
class WebSocketSubscriber {
	constructor(webSocketServerAddr, onOpenCallback, onPublishCallback, onStatusUpdateCallback, logger = console) {
		this.webSocketServerAddr = webSocketServerAddr;
		this.onOpenCallback = onOpenCallback;
		this.onPublishCallback = onPublishCallback;
		this.onStatusUpdateCallback = onStatusUpdateCallback;
		this.logger = logger;
	}

	_onPong(msgObj) {
		this.logger.info("WebSocketSubscriber._onPong");
		this._clearCloseWebSocketTimeout();
	}

	_onPublish(msgObj) {
		this.logger.info("WebSocketSubscriber._onPublish: key = [" + msgObj.key + "]");
		this.onPublishCallback(msgObj);
	}

	_onSubscribeSuccess(msgObj) {
		this.logger.info("WebSocketSubscriber._onSubscribeSuccess: connectionId = [" + msgObj.value.connectionId + "], key = [" + msgObj.value.key + "]");
	}

	_onUnsubscribeSuccess(msgObj) {
		this.logger.info("WebSocketSubscriber._onUnsubscribeSuccess: connectionId = [" + msgObj.value.connectionId + "], key = [" + msgObj.value.key + "]");
	}

	_onWelcome(msgObj) {
		this.logger.info("WebSocketSubscriber._onWelcome: connectionId = [" + msgObj.value.connectionId + "]");
		this.connectionId = msgObj.value.connectionId;
	}

	_onMessage(msgData) {
		var msgObj = JSON.parse(msgData);
		if (msgObj.type == "pong") {
			this._onPong(msgObj);
		} else if (msgObj.type == "publish") {
			this._onPublish(msgObj);
		} else if (msgObj.type == "subscribeSuccess") {
			this._onSubscribeSuccess(msgObj);
		} else if (msgObj.type == "unsubscribeSuccess") {
			this._onUnsubscribeSuccess(msgObj);
		} else if (msgObj.type == "welcome") {
			this._onWelcome(msgObj);
		} else {
			this.logger.debug("unknown message: " + msgData);
		}
	}

	subscribe(key) {
		try {
			this.logger.info("subscriber for key: [" + key + "]");
			this.webSocket.send('{"type": "subscribe", "key":"' + key + '"}');
		} catch (e) {
			this.logger.error(e.stack);
		}
	}

	unsubscribe(key) {
		try {
			this.logger.info("unsubscribe for key: [" + key + "]");
			this.webSocket.send('{"type": "unsubscribe", "key":"' + key + '"}');
		} catch (e) {
			this.logger.error(e.stack);
		}
	}

	_notifyStatusUpdate(status) {
		this.onStatusUpdateCallback(status);
	}

	_clearPingTimeout() {
		window.clearTimeout(this.pingTimeout);
		this.pingTimeout = null;
	}

	_clearCloseWebSocketTimeout() {
		window.clearTimeout(this.closeWebSocketTimeout);
		this.closeWebSocketTimeout = null;
	}

	_startPing() {
		try {
			this.logger.info("send ping to server.");
			this.webSocket.send('{"type": "ping"}');
		} catch (e) {
			this.logger.error(e.stack);
		}

		var that = this;
		
		this._clearCloseWebSocketTimeout();
		this.closeWebSocketTimeout = window.setTimeout(function() {
			that.logger.error("didn't receive message from server for ping, so restart WebSocket.");
			that._disconnect();
			that._connect();
		}, 5 * 1000);
		
		this._clearPingTimeout();
		this.pingTimeout = window.setTimeout(function() {
			that._startPing();
		}, 30 * 1000);
	}

	_onOpen() {
		this._startPing();
		this.onOpenCallback();
	}

	_disconnect() {
		this._clearCloseWebSocketTimeout();
		this._clearPingTimeout();
		this.webSocket.close();
	}

	_connect() {
		this.logger.info("WebSocket new");
		this.webSocket = new WebSocket(this.webSocketServerAddr);

		var that = this;

		this.webSocket.onopen = function(e) {
			that.logger.info("WebSocket open");
			that._notifyStatusUpdate("open");
			that._onOpen();
		}
		this.webSocket.onmessage = function(e) {
			that._notifyStatusUpdate("open");
			that._onMessage(e.data);
		}
		this.webSocket.onerror = function(e) {
			that.logger.error("WebSocket error");
			that._notifyStatusUpdate("error");
		}
		this.webSocket.onclose = function(e) {
			that.logger.error("WebSocket close, with reason: [" + e.code + " - " + getWebsocketErrorReason(e.code) + "]");
			that._notifyStatusUpdate("close");
		}
	}

	_watchDog() {
		var that = this;
		this.watchDogInterval = window.setInterval(function() {
			if (that.webSocket.readyState != that.webSocket.OPEN) {
				that.logger.error("WebSocketSubscriber._watchDog: websocket readyState is not OPEN, so restart WebSocket.");
				that._disconnect();
				that._connect();
			} else {
				that.logger.debug("WebSocketSubscriber._watchDog: websocket readyState is OPEN.");
			}
		}, 60 * 1000);
	}

	start() {
		this._connect();
		this._watchDog();
	}
}
