<?php
namespace MyApp;

use Ratchet\MessageComponentInterface;
use Ratchet\ConnectionInterface;

class Socket implements MessageComponentInterface {
	public function __construct() {
		$this->subscribers = new \SplObjectStorage;
	}

	// -----------------------------------------------------------------

	private function log($str) {
		echo date('Y-m-d H:i:s') . ": " . $str . "\n";
	}

	private function addSubscriber($key, ConnectionInterface $conn) {
		$this->removeSubscriberForConnectionForKey($conn, $key);

		$subscriber = new \stdClass();
		$subscriber->key = $key;
		$subscriber->conn = $conn;

		$this->subscribers->attach($subscriber);
	}

	private function removeSubscriberByConnection(ConnectionInterface $conn) {
		foreach ($this->subscribers as $subscriber) {
			if ($conn == $subscriber->conn) {
				$this->subscribers->detach($subscriber);
				// don't break, a subscriber may have subscribed to multiple keys
			}
		}
	}

	private function removeSubscriberForConnectionForKey(ConnectionInterface $conn, $key) {
		foreach ($this->subscribers as $subscriber) {
			if ($conn == $subscriber->conn && $key == $subscriber->key) {
				$this->subscribers->detach($subscriber);
				break; // a subscriber won't be able to subscribe multiple times for a same key
			}
		}
	}

	// -----------------------------------------------------------------

	private function onPingMsg(ConnectionInterface $conn, $msgObj) {
		$this->log("({$conn->resourceId} - {$conn->remoteAddress}) onPingMsg");

		$conn->send('{"type": "pong"}');
	}

	private function onPublishMsg(ConnectionInterface $conn, $msgObj) {
		$this->log("({$conn->resourceId} - {$conn->remoteAddress}) onPublishMsg with key: [{$msgObj->key}]");

		$publishJson = json_encode($msgObj, JSON_UNESCAPED_SLASHES);

		foreach ($this->subscribers as $subscriber) {
			if ($msgObj->key == $subscriber->key || "_all_" == $subscriber->key) {
				$subscriber->conn->send($publishJson);
				$this->log("publish -> ({$subscriber->conn->resourceId} - {$subscriber->conn->remoteAddress}) with message.key: [{$msgObj->key}]");
			}
		}
	}

	private function onSubscribeMsg(ConnectionInterface $conn, $msgObj) {
		$this->log("({$conn->resourceId} - {$conn->remoteAddress}) onSubscribeMsg for key: [{$msgObj->key}]");

		$this->addSubscriber($msgObj->key, $conn);

		$conn->send('{"type": "subscribeSuccess", "value": {"connectionId": ' . $conn->resourceId . ', "key": "' . $msgObj->key . '"}}');
	}

	private function onUnsubscribeMsg(ConnectionInterface $conn, $msgObj) {
		$this->log("({$conn->resourceId} - {$conn->remoteAddress}) onUnsubscribeMsg for key: [{$msgObj->key}]");

		$this->removeSubscriberForConnectionForKey($conn, $msgObj->key);

		$conn->send('{"type": "unsubscribeSuccess", "value": {"connectionId": ' . $conn->resourceId . ', "key": "' . $msgObj->key . '"}}');
	}

	private function welcome(ConnectionInterface $conn) {
		$conn->send('{"type": "welcome", "value": {"connectionId": ' . $conn->resourceId . '}}');
	}

	// -----------------------------------------------------------------

	public function onOpen(ConnectionInterface $conn) {
		$this->log("({$conn->resourceId} - {$conn->remoteAddress}) New connection!");

		$this->welcome($conn);
	}

	public function onMessage(ConnectionInterface $conn, $msg) {
		$msgObj = json_decode($msg);

		if ($msgObj->type == 'ping') {
			$this->onPingMsg($conn, $msgObj);
		} elseif ($msgObj->type == 'publish') {
			$this->onPublishMsg($conn, $msgObj);
		} elseif ($msgObj->type == 'subscribe') {
			$this->onSubscribeMsg($conn, $msgObj);
		} elseif ($msgObj->type == 'unsubscribe') {
			$this->onUnsubscribeMsg($conn, $msgObj);
		} else {
			$this->log("({$conn->resourceId} - {$conn->remoteAddress}) unknown message: " . $msg);
		}
	}

	public function onError(ConnectionInterface $conn, \Exception $e) {
		$this->log("({$conn->resourceId} - {$conn->remoteAddress}) Error: " . $e->getMessage());

		$conn->close();
	}

	public function onClose(ConnectionInterface $conn) {
		$this->log("({$conn->resourceId} - {$conn->remoteAddress}) Connection closed!");

		$this->removeSubscriberByConnection($conn);
	}
}
