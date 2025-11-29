import asyncio
import json
import logging
from datetime import datetime
import ssl
import websockets

class WebSocketPubSubClient:
    def __init__(self, webSocketServerAddr, callbacks=None, logger=None):
        """
        callbacks = {
            'onOpenCallback': None,
            'onErrorCallback': None,
            'onCloseCallback': None,
            'onStatusUpdateCallback': None,
            'onWelcomeMsgCallback': None,
            'onPublishMsgCallback': None,
            'onSubscribeSuccessMsgCallback': None,
            'onUnsubscribeSuccessMsgCallback': None,
        }
        """
        self.webSocketServerAddr = webSocketServerAddr

        # Initialize callbacks
        if callbacks:
            self.onOpenCallback = callbacks.get('onOpenCallback')
            self.onErrorCallback = callbacks.get('onErrorCallback')
            self.onCloseCallback = callbacks.get('onCloseCallback')
            self.onStatusUpdateCallback = callbacks.get('onStatusUpdateCallback')
            self.onWelcomeMsgCallback = callbacks.get('onWelcomeMsgCallback')
            self.onPublishMsgCallback = callbacks.get('onPublishMsgCallback')
            self.onSubscribeSuccessMsgCallback = callbacks.get('onSubscribeSuccessMsgCallback')
            self.onUnsubscribeSuccessMsgCallback = callbacks.get('onUnsubscribeSuccessMsgCallback')

        self.logger = logger or logging.getLogger("WebSocketPubSubClient")

        self.webSocket = None
        self.connectionId = None

        self._ping_interval = 30
        self._close_websocket_timeout = 5
        self._watchdog_interval = 60
        self._ping_task = None
        self._close_websocket_task = None
        self._watchdog_task = None

    # core functions -----------------------------------------

    def _startPing(self):
        self._ping_task = asyncio.create_task(self._ping_task_fun())

    async def _ping_task_fun(self):
        while True:
            try:
                self.logger.debug("WebSocketPubSubClient._ping_task_fun: send ping to server.")
                await self.webSocket.send('{"type": "ping"}')
            except Exception as e:
                self.logger.error(f"Ping error: {e}")

            self._cancelCloseWebSocketTask()
            self._close_websocket_task = asyncio.create_task(self._close_websocket_task_fun())

            await asyncio.sleep(self._ping_interval)

    async def _close_websocket_task_fun(self):
        try:
            await asyncio.sleep(self._close_websocket_timeout)
            self.logger.warning("WebSocketPubSubClient._close_websocket_task_fun: didn't receive message from server for ping, so restart WebSocket.")
            await self._notifyStatusUpdate("warning")
            await self._disconnect()
            await self._connect()
        except asyncio.CancelledError:
            # this is due to pong arrived -> task cancelled
            return

    def _cancelPingTask(self):
        if self._ping_task:
            self._ping_task.cancel()
            self._ping_task = None

    def _cancelCloseWebSocketTask(self):
        if self._close_websocket_task:
            self._close_websocket_task.cancel()
            self._close_websocket_task = None

    def _startWatchDog(self):
        self._watchdog_task = asyncio.create_task(self._watchdog_task_fun())

    async def _watchdog_task_fun(self):
        while True:
            await asyncio.sleep(self._watchdog_interval)
            if self.webSocket is None or not self.webSocket.open:
                self.logger.warning("WebSocketPubSubClient._watchdog_task_fun: websocket is not OPEN, so restart WebSocket.")
                await self._notifyStatusUpdate("warning")
                await self._disconnect()
                await self._connect()
            else:
                self.logger.debug("WebSocketPubSubClient._watchdog_task_fun: websocket is OPEN.")

    def _cancelWatchDogTask(self):
        if self._watchdog_task:
            self._watchdog_task.cancel()
            self._watchdog_task = None

    async def _connect(self):
        self.logger.info("WebSocketPubSubClient._connect: WebSocket connect")

        try:
            # disable server self-sign certification check
            self.ssl_context = ssl.create_default_context()
            self.ssl_context.check_hostname = False
            self.ssl_context.verify_mode = ssl.CERT_NONE

            async with websockets.connect(self.webSocketServerAddr, ssl=self.ssl_context) as webSocket:
                self.webSocket = webSocket

                # onopen
                self.logger.info("WebSocketPubSubClient.onopen: WebSocket open")
                await self._notifyStatusUpdate("open");
                await self._onOpen();

                # onmessage
                async for message in self.webSocket:
                    await self._notifyStatusUpdate("open");
                    await self._onMessage(message)

                # onclose
                close_code = self.webSocket.close_code
                close_reason = self.webSocket.close_reason
                self.logger.info(f"WebSocketPubSubClient.onclose: WebSocket close, with reason: [{close_code} - {close_reason}]")
                await self._notifyStatusUpdate("close");
                await self._onClose();
        except Exception as e:
            # onerror
            self.logger.error(f"WebSocketPubSubClient.onerror: WebSocket error: {e}")
            await self._notifyStatusUpdate("error");
            await self._onError(e);

    async def _disconnect(self):
        self._cancelCloseWebSocketTask()
        self._cancelPingTask()
        self._cancelWatchDogTask()
        await self.webSocket.close()

    # core handlers -----------------------------------------

    async def _notifyStatusUpdate(self, status):
        if self.onStatusUpdateCallback: await self.onStatusUpdateCallback(status)

    async def _onOpen(self):
        self._startPing()
        self._startWatchDog()
        if self.onOpenCallback: await self.onOpenCallback()

    async def _onMessage(self, msgData):
        msgObj = json.loads(msgData)

        self.logger.debug("WebSocketPubSubClient._onMessage: check msgObj in debug log")
        self.logger.debug(json.dumps(msgObj, indent=4))

        msgType = msgObj.get("type")
        if msgType == "pong":
            self._onPongMsg(msgObj)
        elif msgType == "publish":
            await self._onPublishMsg(msgObj)
        elif msgType == "subscribeSuccess":
            await self._onSubscribeSuccessMsg(msgObj)
        elif msgType == "unsubscribeSuccess":
            await self._onUnsubscribeSuccessMsg(msgObj)
        elif msgType == "welcome":
            await self._onWelcomeMsg(msgObj)
        else:
            self.logger.warning(f"WebSocketPubSubClient._onMessage: unknown message: {msgData}")

    async def _onError(self, e):
        if self.onErrorCallback: await self.onErrorCallback()

    async def _onClose(self):
        if self.onCloseCallback: await self.onCloseCallback()

    # onMessage handlers -----------------------------------------

    def _onPongMsg(self, msgObj):
        self.logger.debug("WebSocketPubSubClient._onPongMsg")
        self._cancelCloseWebSocketTask()

    async def _onPublishMsg(self, msgObj):
        self.logger.info("WebSocketPubSubClient._onPublishMsg: key = [" + msgObj.get("key") + "]")
        if self.onPublishMsgCallback: await self.onPublishMsgCallback(msgObj)

    async def _onSubscribeSuccessMsg(self, msgObj):
        self.logger.info("WebSocketPubSubClient._onSubscribeSuccessMsg: connectionId = [" + str(msgObj['value']['connectionId']) + "], key = [" + msgObj['value']['key'] + "]")
        if self.onSubscribeSuccessMsgCallback: await self.onSubscribeSuccessMsgCallback(msgObj)

    async def _onUnsubscribeSuccessMsg(self, msgObj):
        self.logger.info("WebSocketPubSubClient._onUnsubscribeSuccessMsg: connectionId = [" + str(msgObj['value']['connectionId']) + "], key = [" + msgObj['value']['key'] + "]")
        if self.onUnsubscribeSuccessMsgCallback: await self.onUnsubscribeSuccessMsgCallback(msgObj)

    async def _onWelcomeMsg(self, msgObj):
        self.logger.info("WebSocketPubSubClient._onWelcomeMsg: connectionId = [" + str(msgObj['value']['connectionId']) + "]")
        self.connectionId = msgObj['value']['connectionId']
        if self.onWelcomeMsgCallback: await self.onWelcomeMsgCallback(msgObj)

    # APIs -----------------------------------------

    async def start(self):
        await self._connect()

    async def publish(self, key, dataObj):
        try:
            publishObj = {
                "type": "publish",
                "key": key,
                "date": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "value": dataObj
            }

            self.logger.info("WebSocketPubSubClient.publish: for key: [" + key + "]")
            self.logger.debug(json.dumps(publishObj, indent=4))

            await self.webSocket.send(json.dumps(publishObj))
        except Exception as e:
            self.logger.error(f"WebSocketPubSubClient.publish error: {e}")

    async def subscribe(self, key):
        try:
            self.logger.info("WebSocketPubSubClient.subscribe: subscribe for key: [" + key + "]")
            await self.webSocket.send('{"type": "subscribe", "key":"' + key + '"}')
        except Exception as e:
            self.logger.error(f"WebSocketPubSubClient.subscribe error: {e}")

    async def unsubscribe(self, key):
        try:
            self.logger.info("WebSocketPubSubClient.unsubscribe: unsubscribe for key: [" + key + "]")
            await self.webSocket.send('{"type": "unsubscribe", "key":"' + key + '"}')
        except Exception as e:
            self.logger.error(f"WebSocketPubSubClient.unsubscribe error: {e}")

