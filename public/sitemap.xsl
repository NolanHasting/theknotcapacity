<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9">
<xsl:output method="html" encoding="UTF-8"/>
<xsl:template match="/">
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Knot Capacity · Sitemap</title>
<style>body{max-width:720px;margin:60px auto;padding:0 20px;background:#080c09;color:#f4f5f1;font:16px/1.65 system-ui,sans-serif}h1{font-size:32px;letter-spacing:-.04em}p{color:#b7c2b5}a{color:#a6dda8}li{margin:16px 0;padding:14px;border:1px solid #435044;border-radius:8px;overflow-wrap:anywhere}</style></head>
<body><h1>Knot Capacity sitemap</h1><p>This XML sitemap tells search engines which pages to crawl. The current public site has one main page, listed below.</p><ul><xsl:for-each select="sm:urlset/sm:url"><li><a href="{sm:loc}"><xsl:value-of select="sm:loc"/></a></li></xsl:for-each></ul><p><a href="/">Back to the live occupancy tracker</a></p></body></html>
</xsl:template></xsl:stylesheet>
