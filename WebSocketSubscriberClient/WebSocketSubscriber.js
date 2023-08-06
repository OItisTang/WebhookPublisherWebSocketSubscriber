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
// WebSocketSubscriber: subscribe to one or multiple keys for updates
// ---------------------
class WebSocketSubscriber {
	constructor(
		webSocketServerAddr,
		callbacks = {
			onOpenCallback : null,
			onErrorCallback : null,
			onCloseCallback : null,
			onStatusUpdateCallback : null,

			onWelcomeMsgCallback : null,
			onPublishMsgCallback : null,
			onSubscribeSuccessMsgCallback : null,
			onUnsubscribeSuccessMsgCallback : null,
		},
		logger = console
	) {
		this.webSocketServerAddr = webSocketServerAddr;

		this.onOpenCallback = callbacks.onOpenCallback;
		this.onErrorCallback = callbacks.onErrorCallback;
		this.onCloseCallback = callbacks.onCloseCallback;
		this.onStatusUpdateCallback = callbacks.onStatusUpdateCallback;

		this.onWelcomeMsgCallback = callbacks.onWelcomeMsgCallback;
		this.onPublishMsgCallback = callbacks.onPublishMsgCallback;
		this.onSubscribeSuccessMsgCallback = callbacks.onSubscribeSuccessMsgCallback;
		this.onUnsubscribeSuccessMsgCallback = callbacks.onUnsubscribeSuccessMsgCallback;

		this.logger = logger;
	}

	// core functions -----------------------------------------

	_startPing() {
		try {
			this.logger.debug("WebSocketSubscriber._startPing: send ping to server.");
			this.webSocket.send('{"type": "ping"}');
		} catch (e) {
			this.logger.error(e.stack);
		}

		var that = this;
		
		this._clearCloseWebSocketTimeout();
		this.closeWebSocketTimeout = window.setTimeout(function() {
			that.logger.warn("WebSocketSubscriber._startPing: didn't receive message from server for ping, so restart WebSocket.");
			that._disconnect();
			that._connect();
		}, 5 * 1000);
		
		this._clearPingTimeout();
		this.pingTimeout = window.setTimeout(function() {
			that._startPing();
		}, 30 * 1000);
	}

	_clearPingTimeout() {
		window.clearTimeout(this.pingTimeout);
		this.pingTimeout = null;
	}

	_clearCloseWebSocketTimeout() {
		window.clearTimeout(this.closeWebSocketTimeout);
		this.closeWebSocketTimeout = null;
	}

	_connect() {
		this.logger.info("WebSocketSubscriber._connect: WebSocket new");
		this.webSocket = new WebSocket(this.webSocketServerAddr);

		var that = this;

		this.webSocket.onopen = function(e) {
			that.logger.info("WebSocketSubscriber.onopen: WebSocket open");
			that._notifyStatusUpdate("open");
			that._onOpen();
		}
		this.webSocket.onmessage = function(e) {
			that._notifyStatusUpdate("open");
			that._onMessage(e.data);
		}
		this.webSocket.onerror = function(e) {
			that.logger.error("WebSocketSubscriber.onerror: WebSocket error");
			that._notifyStatusUpdate("error");
			that._onError(e);
		}
		this.webSocket.onclose = function(e) {
			that.logger.error("WebSocketSubscriber.onclose: WebSocket close, with reason: [" + e.code + " - " + getWebsocketErrorReason(e.code) + "]");
			that._notifyStatusUpdate("close");
			that._onClose(e);
		}
	}

	_disconnect() {
		this._clearCloseWebSocketTimeout();
		this._clearPingTimeout();
		this.webSocket.close();
	}

	_watchDog() {
		var that = this;
		this.watchDogInterval = window.setInterval(function() {
			if (that.webSocket.readyState != that.webSocket.OPEN) {
				that.logger.warn("WebSocketSubscriber._watchDog: websocket readyState is not OPEN, so restart WebSocket.");
				that._disconnect();
				that._connect();
			} else {
				that.logger.debug("WebSocketSubscriber._watchDog: websocket readyState is OPEN.");
			}
		}, 60 * 1000);
	}

	_notifyStatusUpdate(status) {
		if (this.onStatusUpdateCallback) this.onStatusUpdateCallback(status);
	}

	// core handlers -----------------------------------------

	_onOpen() {
		this._startPing();
		if (this.onOpenCallback) this.onOpenCallback();
	}

	_onMessage(msgData) {
		var msgObj = JSON.parse(msgData);

		this.logger.debug("WebSocketSubscriber._onMessage: check msgObj in console");
		if (this.logger.console_debug) {
			this.logger.console_debug(msgObj);
		} else {
			console.debug(msgObj);
		}

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
			this.logger.warn("WebSocketSubscriber._onMessage: unknown message: " + msgData);
		}
	}

	_onError(e) {
		if (this.onErrorCallback) this.onErrorCallback();
	}

	_onClose(e) {
		if (this.onCloseCallback) this.onCloseCallback();
	}

	// onMessage handlers -----------------------------------------

	_onPong(msgObj) {
		this.logger.debug("WebSocketSubscriber._onPong");
		this._clearCloseWebSocketTimeout();
	}

	_onPublish(msgObj) {
		this.logger.info("WebSocketSubscriber._onPublish: key = [" + msgObj.key + "]");
		if (this.onPublishMsgCallback) this.onPublishMsgCallback(msgObj);
	}

	_onSubscribeSuccess(msgObj) {
		this.logger.info("WebSocketSubscriber._onSubscribeSuccess: connectionId = [" + msgObj.value.connectionId + "], key = [" + msgObj.value.key + "]");
		if (this.onSubscribeSuccessMsgCallback) this.onSubscribeSuccessMsgCallback(msgObj);
	}

	_onUnsubscribeSuccess(msgObj) {
		this.logger.info("WebSocketSubscriber._onUnsubscribeSuccess: connectionId = [" + msgObj.value.connectionId + "], key = [" + msgObj.value.key + "]");
		if (this.onUnsubscribeSuccessMsgCallback) this.onUnsubscribeSuccessMsgCallback(msgObj);
	}

	_onWelcome(msgObj) {
		this.logger.info("WebSocketSubscriber._onWelcome: connectionId = [" + msgObj.value.connectionId + "]");
		this.connectionId = msgObj.value.connectionId;
		if (this.onWelcomeMsgCallback) this.onWelcomeMsgCallback(msgObj);
	}

	// APIs -----------------------------------------

	start() {
		this._connect();
		this._watchDog();
	}

	subscribe(key) {
		try {
			this.logger.info("WebSocketSubscriber.subscribe: subscribe for key: [" + key + "]");
			this.webSocket.send('{"type": "subscribe", "key":"' + key + '"}');
		} catch (e) {
			this.logger.error(e.stack);
		}
	}

	unsubscribe(key) {
		try {
			this.logger.info("WebSocketSubscriber.unsubscribe: unsubscribe for key: [" + key + "]");
			this.webSocket.send('{"type": "unsubscribe", "key":"' + key + '"}');
		} catch (e) {
			this.logger.error(e.stack);
		}
	}
}
