<?php

require __DIR__ . '/vendor/autoload.php';

// parameters:
//   channel=channel_name	// send channel will be "channel_name.q", receive channel will be "channel_name.a"
//   request={"key1": "value1", "key2": "value2"}	// an json obj string, containing custom key-value pairs
//
// will print "output" value from the object returned by the channel service

header('Content-Type: text/plain');

$channel = "";
$requestObj = null;
$isResponseReceived = false;

if (
	(isset($_GET['channel']) && !empty($_GET['channel'])) &&
	(isset($_GET['request']) && !empty($_GET['request']))
) {
	$channel = $_GET['channel'];
	$requestObj = json_decode($_GET['request']);
} else {
	die("no channel or request in GET parameter!");
}

use React\Socket\Connector;
use React\EventLoop\Loop;
use Ratchet\Client\Connector as RatchetConnector;

$loop = Loop::get();

// --- START: SSL Context Options for Self-Signed Certs ---
$socketConnector = new Connector($loop, [
	'tls' => [
		// !!! CRITICAL OPTION !!!
		// Disable peer verification entirely. This allows self-signed certificates.
		'verify_peer' => false,
		// Also good practice to disable peer name verification if the hostname doesn't match the cert
		'verify_peer_name' => false,
	]
]);
// --- END: SSL Context Options ---

$ratchetConnector = new RatchetConnector($loop, $socketConnector);

$ratchetConnector('wss://149.28.204.205:8081')->then(
	function($conn) use($channel, $requestObj, &$isResponseReceived, $loop, $timeoutTimer) {
		// echo "Successfully connected to the WebSocket server!\n";

		// timeout
		$timeoutTimer = $loop->addTimer(10, function () use ($conn, $channel, &$isResponseReceived, $loop) {
			if (!$isResponseReceived) {
				$conn->send('{"type": "unsubscribe", "key":"' . $channel . '.a"}');
				$conn->close();

				$loop->stop();
				die("Waiting for response timeout!");
			}
		});

		$conn->on('message', function($msgData) use ($conn, $channel, $requestObj, &$isResponseReceived, $loop, $timeoutTimer) {
			$msgObj = json_decode($msgData);
			if ($msgObj->type == "welcome") {
				$conn->send('{"type": "subscribe", "key":"' . $channel . '.a"}');
			} elseif ($msgObj->type == "subscribeSuccess") {
				$publishObj = new stdClass();
				$publishObj->type = "publish";
				$publishObj->key = $channel . ".q";
				$publishObj->date = date('Y-m-d H:i:s');
				$publishObj->value = $requestObj;

				$publishJson = json_encode($publishObj, JSON_UNESCAPED_SLASHES);
				// echo "Send message: {$publishJson}\n";
				$conn->send($publishJson);
			} elseif ($msgObj->type == "publish") {
				$isResponseReceived = true;
				$loop->cancelTimer($timeoutTimer);

				$valueObj = $msgObj->value;
				echo $valueObj->output; // output to user, business done

				$conn->send('{"type": "unsubscribe", "key":"' . $channel . '.a"}');
				$conn->close();
			}
		});

		$conn->on('close', function() use (&$isResponseReceived, $loop, $timeoutTimer) {
			// echo "Connection closed.\n";
			if (!$isResponseReceived) {
				$loop->cancelTimer($timeoutTimer);
				$loop->stop();
				die("Connection closed unexpectedly!");
			}
		});
	}, function ($e) use ($loop, $timeoutTimer) {
		$loop->cancelTimer($timeoutTimer);
		$loop->stop();
		die("Could not connect! Error: {$e->getMessage()}");
	}
);

