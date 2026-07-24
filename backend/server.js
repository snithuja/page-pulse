const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const validator = require('validator');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Constants
const TIMEOUT = 10000; // 10 seconds
const MAX_RESPONSE_SIZE = 5 * 1024 * 1024; // 5MB

// Helper functions
const isValidUrl = (url) => {
  if (!url) return false;
  // Add http:// if no protocol
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'http://' + url;
  }
  return validator.isURL(url, {
    protocols: ['http', 'https'],
    require_protocol: true,
    require_valid_protocol: true,
    allow_underscores: true,
    allow_trailing_dot: false,
    allow_protocol_relative: false
  });
};

const normalizeUrl = (url) => {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'http://' + url;
  }
  return url;
};

const extractMetaContent = ($, name) => {
  const meta = $(`meta[name="${name}"]`).attr('content');
  return meta || null;
};

const countH1Tags = ($) => {
  return $('h1').length;
};

const countImagesMissingAlt = ($) => {
  let count = 0;
  $('img').each((_, img) => {
    const alt = $(img).attr('alt');
    if (!alt || alt.trim() === '') {
      count++;
    }
  });
  return count;
};

const countWords = (text) => {
  if (!text) return 0;
  // Remove HTML tags, extra spaces, and split by whitespace
  const cleanText = text.replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleanText.split(' ').length;
};

// Audit endpoint
app.post('/api/audit', async (req, res) => {
  try {
    const { url } = req.body;

    // Validate URL
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }

    if (!isValidUrl(url)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid URL format. Please enter a valid URL (e.g., https://example.com)'
      });
    }

    const normalizedUrl = normalizeUrl(url);

    try {
      // Fetch the page with timeout
      const startTime = Date.now();
      const response = await axios.get(normalizedUrl, {
        timeout: TIMEOUT,
        maxContentLength: MAX_RESPONSE_SIZE,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; PagePulse/1.0)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        validateStatus: (status) => status < 500 // Accept 4xx responses but not 5xx
      });

      const responseTime = Date.now() - startTime;
      const statusCode = response.status;

      // Check if response is HTML
      const contentType = response.headers['content-type'] || '';
      const isHtml = contentType.includes('text/html') || 
                     contentType.includes('application/xhtml+xml');

      if (!isHtml) {
        return res.status(200).json({
          success: true,
          data: {
            url: normalizedUrl,
            httpStatus: statusCode,
            responseTime: responseTime,
            error: 'Non-HTML response received. The URL does not return an HTML page.',
            title: null,
            description: null,
            h1Count: 0,
            imagesMissingAlt: 0,
            wordCount: 0,
            contentType: contentType
          }
        });
      }

      // Parse HTML
      const $ = cheerio.load(response.data);

      // Extract information
      const title = $('title').text().trim() || null;
      const description = extractMetaContent($, 'description');
      const h1Count = countH1Tags($);
      const imagesMissingAlt = countImagesMissingAlt($);
      
      // Get text content for word count
      const bodyText = $('body').text();
      const wordCount = countWords(bodyText);

      // Build report
      const report = {
        success: true,
        data: {
          url: normalizedUrl,
          httpStatus: statusCode,
          responseTime: responseTime,
          title: title,
          description: description,
          h1Count: h1Count,
          imagesMissingAlt: imagesMissingAlt,
          wordCount: wordCount,
          contentType: contentType,
          // Additional helpful info
          hasMetaDescription: description !== null,
          hasTitle: title !== null,
          hasH1Tags: h1Count > 0,
          hasImages: $('img').length > 0
        }
      };

      // Add warnings if needed
      const warnings = [];
      if (!title) warnings.push('No title tag found');
      if (!description) warnings.push('No meta description found');
      if (h1Count === 0) warnings.push('No H1 tags found');
      if (imagesMissingAlt > 0) warnings.push(`${imagesMissingAlt} image(s) missing alt text`);
      
      if (warnings.length > 0) {
        report.data.warnings = warnings;
      }

      res.json(report);

    } catch (error) {
      // Handle various error types
      let errorMessage = 'Failed to fetch the URL';
      let statusCode = 500;

      if (error.code === 'ECONNABORTED') {
        errorMessage = 'Request timed out. The server took too long to respond.';
        statusCode = 408;
      } else if (error.code === 'ENOTFOUND') {
        errorMessage = 'Domain not found. Please check the URL and try again.';
        statusCode = 404;
      } else if (error.response) {
        // The request was made and the server responded with a status code
        // outside the range of 2xx and 5xx (we accepted 4xx above)
        if (error.response.status >= 500) {
          errorMessage = `Server error (${error.response.status}). The website is currently unavailable.`;
          statusCode = 503;
        } else {
          // This shouldn't happen with our validateStatus, but just in case
          errorMessage = `HTTP ${error.response.status} error`;
          statusCode = error.response.status;
        }
      } else if (error.request) {
        // The request was made but no response was received
        errorMessage = 'No response received from the server. Please check your internet connection.';
        statusCode = 504;
      } else if (error.message && error.message.includes('maxContentLength')) {
        errorMessage = 'Response too large. The page exceeds the maximum size limit.';
        statusCode = 413;
      } else {
        errorMessage = error.message || 'An unexpected error occurred';
      }

      res.status(statusCode).json({
        success: false,
        error: errorMessage,
        url: normalizedUrl,
        errorCode: error.code || null
      });
    }

  } catch (error) {
    console.error('Unexpected error:', error);
    res.status(500).json({
      success: false,
      error: 'An unexpected error occurred. Please try again later.'
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Page Pulse backend running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
});