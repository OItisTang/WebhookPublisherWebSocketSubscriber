<?php

require dirname( __FILE__ ) . '/vendor/autoload.php';
require dirname( __FILE__ ) . '/app/socket.php';

use Ratchet\Server\IoServer;
use Ratchet\Http\HttpServer;
use Ratchet\WebSocket\WsServer;
use MyApp\Socket;

$loop = React\EventLoop\Factory::create();
$sock = new React\Socket\Server('0.0.0.0:8081', $loop);
$secureSock = new React\Socket\SecureServer($sock, $loop, [
    'local_cert'        => '/etc/letsencrypt/live/tangchenggang.me/fullchain.pem', // path to your cert
    'local_pk'          => '/etc/letsencrypt/live/tangchenggang.me/privkey.pem', // path to your server private key
    'allow_self_signed' => FALSE, // Allow self signed certs (should be false in production)
    'verify_peer' => FALSE
]);

$server = new IoServer(
    new HttpServer(
        new WsServer(
            new Socket()
        )
    ),
    $secureSock, $loop
);

$server->run();
