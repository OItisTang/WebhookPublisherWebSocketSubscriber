<?php

require __DIR__ . '/vendor/autoload.php';

if (!isset($_GET['key']) || empty($_GET['key'])) {
	die("no key in GET parameter");
}

$key = $_GET['key'];
$rawPostData = file_get_contents("php://input");

\Ratchet\Client\connect('wss://systemsecurity.top:8081')->then(function($conn) use($key, $rawPostData) {
	$publishObj = new stdClass();
	$publishObj->type = "publish";
	$publishObj->key = $key;
	$publishObj->value = json_decode($rawPostData);

	$publishJson = json_encode($publishObj, JSON_UNESCAPED_SLASHES);

	$conn->send($publishJson);
	$conn->close();

	echo $publishJson;
}, function ($e) {
	die("Could not connect! Error: {$e->getMessage()}");
});
