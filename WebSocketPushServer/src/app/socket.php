<?php
namespace MyApp;

use Ratchet\MessageComponentInterface;
use Ratchet\ConnectionInterface;

class PublishDataDBManager {
	private $DB_File_Path = '../db/publish_data.db';
	private $db = NULL;
	
	public function __construct() {
		$this->openDB();
		$this->createTableIfNotExists();
	}
	
	private function log($str) {
		echo date('Y-m-d H:i:s') . ": " . $str . "\n";
	}
	
	private function openDB() {
		$this->db = new \SQLite3($this->DB_File_Path);
		if(!$this->db) {
			$this->log($this->db->lastErrorMsg());
		}
	}
	
	private function createTableIfNotExists() {
		$sql = "
			CREATE TABLE IF NOT EXISTS PublishData (
				key		VARCHAR(1024)		PRIMARY KEY		NOT NULL,
				msgObj	JSON								NOT NULL
			);
		";

		$ret = $this->db->exec($sql);
		if(!$ret){
			$this->log($this->db->lastErrorMsg());
		}
	}
	
	public function savePublishDataToDB($key, $msgObj) {
		$stm = $this->db->prepare("insert or replace into PublishData values (?, ?)");
		$stm->bindValue(1, $key, SQLITE3_TEXT);
		$stm->bindValue(2, json_encode($msgObj), SQLITE3_TEXT);
		$ret = $stm->execute();
		if(!$ret){
			$this->log($this->db->lastErrorMsg());
		} else {
			$this->log("DB save with key: " . $key);
		}
	}
	
	public function readPublishDataFromDB($key) {
		$stm = $this->db->prepare('SELECT * FROM PublishData WHERE key = :key;');
		$stm->bindValue(':key', $key);
		$ret = $stm->execute();
		if(!$ret){
			$this->log($this->db->lastErrorMsg());
		} else {
			$this->log("DB read with key: " . $key);
		}
		
		$msgObj = NULL;
		
		if ($ret->numColumns()) {
			while ($row = $ret->fetchArray(SQLITE3_TEXT)) {
				$msgObj = json_decode($row['msgObj']);
				break;
			}
		}
		
		return $msgObj;
	}
}

class Socket implements MessageComponentInterface {
	public function __construct() {
		$this->subscribers = new \SplObjectStorage;
		$this->publishDataDBManager = new PublishDataDBManager();
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

		$this->publishDataDBManager->savePublishDataToDB($msgObj->key, $msgObj);

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

		$publishObjFromDB = $this->publishDataDBManager->readPublishDataFromDB($msgObj->key);

		$valueObj = new \stdClass();
		$valueObj->connectionId = $conn->resourceId;
		$valueObj->key = $msgObj->key;
		$valueObj->cachedPublishData = $publishObjFromDB;

		$ackObj = new \stdClass();
		$ackObj->type = "subscribeSuccess";
		$ackObj->value = $valueObj;

		$ackJson = json_encode($ackObj, JSON_UNESCAPED_SLASHES);

		$conn->send($ackJson);
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
