// API URL - Make sure this matches your backend port
const API_URL = 'http://localhost:5000/api/audit';

const form = document.getElementById('auditForm');
const urlInput = document.getElementById('urlInput');
const auditBtn = document.getElementById('auditBtn');
const resultsDiv = document.getElementById('results');
const loadingDiv = document.getElementById('loading');

// Example URL buttons
document.querySelectorAll('.example-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        urlInput.value = this.dataset.url;
        form.dispatchEvent(new Event('submit'));
    });
});

// Form submission
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = urlInput.value.trim();
    if (!url) return;
    await auditUrl(url);
});

async function auditUrl(url) {
    // Show loading
    loadingDiv.style.display = 'block';
    resultsDiv.style.display = 'none';
    auditBtn.disabled = true;
    auditBtn.textContent = 'Auditing...';

    try {
        console.log('Sending request to:', API_URL);
        console.log('With URL:', url);

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url })
        });

        const data = await response.json();
        console.log('Response:', data);

        if (data.success) {
            renderResults(data.data);
        } else {
            renderError(data);
        }
    } catch (error) {
        console.error('Fetch error:', error);
        renderError({
            success: false,
            error: 'Network error. Please check your connection and try again.',
            details: error.message
        });
    } finally {
        loadingDiv.style.display = 'none';
        auditBtn.disabled = false;
        auditBtn.textContent = 'Audit';
    }
}

function renderResults(data) {
    const isSuccess = data.httpStatus >= 200 && data.httpStatus < 400;
    const statusClass = isSuccess ? 'status-success' : 'status-warning';

    let warningsHtml = '';
    if (data.warnings && data.warnings.length > 0) {
        warningsHtml = `
            <div class="warning-section">
                <h4>⚠️ Warnings</h4>
                <ul>
                    ${data.warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}
                </ul>
            </div>
        `;
    }

    const html = `
        <div class="result-card">
            <div class="result-header">
                <div class="url-display">
                    <strong>Audited:</strong> ${escapeHtml(data.url)}
                </div>
                <span class="status-badge ${statusClass}">
                    HTTP ${data.httpStatus}
                </span>
            </div>

            <div class="result-grid">
                <div class="metric">
                    <div class="metric-label">Response Time</div>
                    <div class="metric-value">${data.responseTime} <span class="unit">ms</span></div>
                </div>
                <div class="metric">
                    <div class="metric-label">Page Title</div>
                    <div class="metric-value">${data.title ? escapeHtml(data.title) : '❌ Not found'}</div>
                </div>
                <div class="metric">
                    <div class="metric-label">Meta Description</div>
                    <div class="metric-value">${data.description ? escapeHtml(data.description) : '❌ Not found'}</div>
                </div>
                <div class="metric">
                    <div class="metric-label">H1 Tags</div>
                    <div class="metric-value">${data.h1Count}</div>
                </div>
                <div class="metric">
                    <div class="metric-label">Images Missing Alt</div>
                    <div class="metric-value ${data.imagesMissingAlt > 0 ? 'status-warning' : ''}">${data.imagesMissingAlt}</div>
                </div>
                <div class="metric">
                    <div class="metric-label">Word Count</div>
                    <div class="metric-value">${data.wordCount.toLocaleString()}</div>
                </div>
            </div>

            ${data.contentType ? `
                <div style="font-size:0.85rem;color:#6b7280;margin-top:12px;">
                    Content-Type: ${data.contentType}
                </div>
            ` : ''}

            ${data.error ? `
                <div class="error-message" style="margin-top:16px;">
                    <strong>⚠️ Note:</strong> ${escapeHtml(data.error)}
                </div>
            ` : ''}

            ${warningsHtml}
        </div>
    `;

    resultsDiv.innerHTML = html;
    resultsDiv.style.display = 'block';
}

function renderError(data) {
    const html = `
        <div class="result-card">
            <div class="error-message">
                <h4>❌ Error</h4>
                <p>${escapeHtml(data.error || 'An unexpected error occurred')}</p>
                ${data.url ? `<p class="error-details">URL: ${escapeHtml(data.url)}</p>` : ''}
                ${data.errorCode ? `<p class="error-details">Error code: ${escapeHtml(data.errorCode)}</p>` : ''}
                ${data.details ? `<p class="error-details">Details: ${escapeHtml(data.details)}</p>` : ''}
            </div>
        </div>
    `;

    resultsDiv.innerHTML = html;
    resultsDiv.style.display = 'block';
}

// Helper function to escape HTML
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}