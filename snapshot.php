<?php
header("Content-Type: application/json; charset=utf-8");

$file = 'csv_snapshot.json';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (file_exists($file)) {
        echo file_get_contents($file);
    } else {
        echo json_encode((object)[]);
    }
} elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = file_get_contents('php://input');
    if (!empty($input)) {
        // Validate JSON
        json_decode($input);
        if (json_last_error() === JSON_ERROR_NONE) {
            file_put_contents($file, $input);
            echo json_encode(["success" => true]);
        } else {
            http_response_code(400);
            echo json_encode(["error" => "Invalid JSON"]);
        }
    } else {
        http_response_code(400);
        echo json_encode(["error" => "Empty payload"]);
    }
} else {
    http_response_code(405);
    echo json_encode(["error" => "Method not allowed"]);
}
