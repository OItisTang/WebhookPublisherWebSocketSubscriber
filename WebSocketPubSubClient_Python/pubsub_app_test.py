#!/usr/bin/env python3
import asyncio

from websocket_pubsub_client import *

class App:
    def __init__(self):
        self.wsPubSub = None

    async def _PubSub_onStatusUpdate(self, status):
        #print("_PubSub_onStatusUpdate: " + status)
        pass

    async def _PubSub_onWelcomeMsg(self, msgObj):
        print("_PubSub_onWelcomeMsg:")
        print(json.dumps(msgObj, indent=4))

        await self.wsPubSub.subscribe("test.req")

    async def _PubSub_onPublishMsg(self, msgObj):
        print("_PubSub_onPublishMsg: received")
        print(json.dumps(msgObj, indent=4))

        key = "test.res"
        dataObj = {
            "key1": "value1",
            "key2": "value2"
        }

        print("_PubSub_onPublishMsg: send")
        print(json.dumps(dataObj, indent=4))

        await self.wsPubSub.publish(key, dataObj)

    async def _PubSub_onSubscribeSuccessMsg(self, msgObj):
        print("_PubSub_onSubscribeSuccessMsg:")
        print(json.dumps(msgObj, indent=4))

    async def _PubSub_onUnsubscribeSuccessMsg(self, msgObj):
        print("_PubSub_onUnsubscribeSuccessMsg:")
        print(json.dumps(msgObj, indent=4))

    async def start(self):
        self.wsPubSub = WebSocketPubSubClient(
            "wss://149.28.204.205:8081",
            callbacks = {
                'onOpenCallback': None,
                'onErrorCallback': None,
                'onCloseCallback': None,
                'onStatusUpdateCallback': self._PubSub_onStatusUpdate,
                'onWelcomeMsgCallback': self._PubSub_onWelcomeMsg,
                'onPublishMsgCallback': self._PubSub_onPublishMsg,
                'onSubscribeSuccessMsgCallback': self._PubSub_onSubscribeSuccessMsg,
                'onUnsubscribeSuccessMsgCallback': self._PubSub_onUnsubscribeSuccessMsg,
            }
        )

        await self.wsPubSub.start()

# ------------------------

app = App()

coroutine_object = app.start()
result = asyncio.run(coroutine_object)
print(f"Result from asyncio.run(): {result}")

