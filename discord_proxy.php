<?php
// PHP Discord Proxy for Security Dashboard
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: *");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, PATCH, OPTIONS");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// Get the path to proxy
$path = '';
if (isset($_GET['b64path'])) {
    $path = base64_decode($_GET['b64path']);
} else if (isset($_GET['path'])) {
    $path = $_GET['path'];
}

if (empty($path)) {
    $requestUri = $_SERVER['REQUEST_URI'];
    // Extract path by removing script name
    $scriptName = $_SERVER['SCRIPT_NAME'];
    $path = str_replace($scriptName, '', $requestUri);
    // Split by ? to ignore query string of the proxy script itself
    $path = explode('?', $path)[0];
    $path = ltrim($path, '/');
}

if (empty($path)) {
    http_response_code(400);
    echo json_encode(["error" => "Missing path parameter"]);
    exit;
}

// Security check: Only allow path starting with api/
if (strpos($path, 'api/') !== 0) {
    http_response_code(403);
    echo json_encode(["error" => "Access denied. Only Discord API requests are allowed."]);
    exit;
}

$targetUrl = "https://discord.com/" . $path;

// Append original query string if any
if (!empty($_SERVER['QUERY_STRING'])) {
    parse_str($_SERVER['QUERY_STRING'], $queryParams);
    unset($queryParams['path']);
    unset($queryParams['b64path']);
    if (!empty($queryParams)) {
        $targetUrl .= "?" . http_build_query($queryParams);
    }
}

// Get input body
$input = file_get_contents("php://input");

// Forward relevant headers
$headers = [];
foreach (getallheaders() as $name => $value) {
    $nameLower = strtolower($name);
    if ($nameLower !== 'host' && $nameLower !== 'content-length' && $nameLower !== 'connection' && $nameLower !== 'accept-encoding') {
        $headers[] = "$name: $value";
    }
}

// Initialize cURL
$ch = curl_init($targetUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $_SERVER['REQUEST_METHOD']);
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);

if ($_SERVER['REQUEST_METHOD'] !== 'GET' && !empty($input)) {
    curl_setopt($ch, CURLOPT_POSTFIELDS, $input);
}

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);

if (curl_errno($ch)) {
    http_response_code(500);
    echo json_encode(["error" => curl_error($ch)]);
} else {
    http_response_code($httpCode);
    if ($contentType) {
        header("Content-Type: $contentType");
    }
    echo $response;
}
curl_close($ch);
