param([int]$Port = 4173)
$siteRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\site'))
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Output "Preview: http://localhost:$Port/"
try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    try {
      $requestPath = [Uri]::UnescapeDataString($context.Request.Url.AbsolutePath)
      if ($requestPath -eq '/__setup.sql') {
        $target = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\supabase\migrations\001_connect_existing_schema.sql'))
      } else {
        if ($requestPath -eq '/') { $requestPath = '/index.html' }
        $target = [System.IO.Path]::GetFullPath((Join-Path $siteRoot $requestPath.TrimStart('/')))
        if (-not $target.StartsWith($siteRoot + [System.IO.Path]::DirectorySeparatorChar)) { throw 'Invalid path' }
      }
      $bytes = [System.IO.File]::ReadAllBytes($target)
      $extension = [System.IO.Path]::GetExtension($target)
      $mimeTypes = @{'.html'='text/html; charset=utf-8';'.js'='text/javascript; charset=utf-8';'.css'='text/css; charset=utf-8';'.png'='image/png';'.jpg'='image/jpeg';'.sql'='text/plain; charset=utf-8'}
      $context.Response.ContentType = $mimeTypes[$extension]
      $context.Response.ContentLength64 = $bytes.Length
      $context.Response.OutputStream.Write($bytes,0,$bytes.Length)
    } catch { $context.Response.StatusCode = 404 }
    finally { $context.Response.Close() }
  }
} finally { $listener.Stop(); $listener.Close() }
