<?php

require __DIR__ . '/vendor/autoload.php';

// Parameter: "key" or "keyPathInDataObj"
//   for "key"
//     format: plain_key_string
//   for "keyPathInDataObj"
//     format: model.shortUrl
//     if data object is: { "model": { "shortUrl": "https://trello.com/b/abcdefg" } }
//     key will be: "https://trello.com/b/abcdefg"
//
// Parameter: "dataObj"
//   only needed for GET method, for POST the dataObj should in POST data body
//   format: dataObj={"key1":"value1","key2":"value2"}

$key = "";
$keyPathInDataObj = "";
$dataObjStr = "";

if (isset($_GET['key']) && !empty($_GET['key'])) {
	$key = $_GET['key'];
} elseif (isset($_GET['keyPathInDataObj']) && !empty($_GET['keyPathInDataObj'])) {
	$keyPathInDataObj = $_GET['keyPathInDataObj'];
} else {
	die("no key or keyPathInDataObj in GET parameter");
}

if (isset($_GET['dataObj']) && !empty($_GET['dataObj'])) {
	$dataObjStr = $_GET['dataObj'];
} else {
	$dataObjStr = file_get_contents("php://input");
}


// ---------------------------------------------
// prepare dataObj
// ---------------------------------------------

$dataObj = json_decode($dataObjStr);

function get_value_from_obj_by_path($object, $path) {
	$o = $object;
	$parts = explode('.', $path);
	$c = count($parts);
	while ($c) {
		$c--;
		$p = array_shift($parts);

		if (isset($o->{$p})) {
			$o = $o->{$p};
		} else {
			$o = null;
			break;
		}
	}
	return $o;
}

if ($keyPathInDataObj != "") {
	$key = get_value_from_obj_by_path($dataObj, $keyPathInDataObj);

	if ($key == null) {
		die("{$keyPathInDataObj} in data is null");
	}
}


// ---------------------------------------------
// publish data to WebSocket server
// ---------------------------------------------

use Ratchet\Client\Connector as WsConnector;
use React\EventLoop\Factory;
use React\Socket\Connector as SocketConnector;

$loop = Factory::create();

// Custom TLS options
$socketConnector = new SocketConnector($loop, [
	'tls' => [
		'verify_peer'       => false,
		'verify_peer_name'  => false,
		'allow_self_signed' => true,
	]
]);

$connector = new WsConnector($loop, $socketConnector);

$connector('wss://149.28.204.205:8081')->then(
	function($conn) use($key, $dataObj) {
		$publishObj = new stdClass();
		$publishObj->type = "publish";
		$publishObj->key = $key;
		$publishObj->date = date('Y-m-d H:i:s');
		$publishObj->value = $dataObj;

		$publishJson = json_encode($publishObj, JSON_UNESCAPED_SLASHES);

		$conn->send($publishJson);
		$conn->close();

		echo $publishJson;
	}, function ($e) {
		die("Could not connect! Error: {$e->getMessage()}");
	}
);

$loop->run();

