/**
 * Capability Statement Upload Component
 * Handles file selection, validation, and upload to the server.
 */
const CapabilityUpload = {
    init: (containerId) => {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = `
            <div class="capability-upload-container" style="border: 2px dashed var(--color-gray-200); padding: 1.5rem; border-radius: 8px; text-align: center;">
                <h4 style="margin-top: 0;">Capability Statement</h4>
                <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem;">
                    Upload your Capability Statement (PDF, DOCX, MAX 10MB) to help agencies find you.
                </p>
                <input type="file" id="csFileInput" accept=".pdf,.doc,.docx" style="display: none;">
                <button class="btn btn-outline" onclick="document.getElementById('csFileInput').click()">Choose File</button>
                <div id="csFileInfo" style="margin-top: 1rem; font-size: 0.9rem; font-weight: 600;"></div>
                <button id="csUploadBtn" class="btn btn-primary" style="margin-top: 1rem; display: none;" onclick="CapabilityUpload.handleUpload()">Upload Now</button>
                <div id="csUploadProgress" style="margin-top: 1rem; display: none;">
                    <div style="width: 100%; bg: var(--color-gray-100); height: 8px; border-radius: 4px; overflow: hidden;">
                        <div id="csProgressBar" style="width: 0%; height: 100%; bg: var(--color-primary); transition: width 0.3s;"></div>
                    </div>
                </div>
                <div id="csUploadStatus" style="margin-top: 0.5rem; font-size: 0.85rem;"></div>
            </div>
        `;

        document.getElementById('csFileInput').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const fileInfo = document.getElementById('csFileInfo');
            const uploadBtn = document.getElementById('csUploadBtn');
            const status = document.getElementById('csUploadStatus');

            // Validation
            const allowed = ['.pdf', '.doc', '.docx'];
            const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();

            if (!allowed.includes(ext)) {
                status.innerHTML = '<span style="color: var(--color-error);">Unsupported file type. Please use PDF or DOCX.</span>';
                uploadBtn.style.display = 'none';
                return;
            }

            if (file.size > 10 * 1024 * 1024) {
                status.innerHTML = '<span style="color: var(--color-error);">File too large (Max 10MB).</span>';
                uploadBtn.style.display = 'none';
                return;
            }

            fileInfo.textContent = `Selected: ${file.name}`;
            status.textContent = '';
            uploadBtn.style.display = 'inline-block';
        });
    },

    handleUpload: async () => {
        const fileInput = document.getElementById('csFileInput');
        const file = fileInput.files[0];
        if (!file) return;

        const uploadBtn = document.getElementById('csUploadBtn');
        const progress = document.getElementById('csUploadProgress');
        const progressBar = document.getElementById('csProgressBar');
        const status = document.getElementById('csUploadStatus');
        const user = Auth.getUser();

        uploadBtn.disabled = true;
        progress.style.display = 'block';
        status.textContent = 'Uploading...';

        const formData = new FormData();
        formData.append('file', file);
        formData.append('userId', user.id);

        try {
            const response = await fetch('/api/upload-cs', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error('Upload failed');

            const result = await response.json();
            status.innerHTML = '<span style="color: var(--color-success);">Successfully uploaded!</span>';
            progressBar.style.width = '100%';
            uploadBtn.style.display = 'none';

            // Optionally update user in localStorage
            if (user) {
                user.capability_statement = result.path;
                localStorage.setItem('wfc_user', JSON.stringify(user));
            }
        } catch (error) {
            console.error('Upload error:', error);
            status.innerHTML = `<span style="color: var(--color-error);">Error: ${error.message}</span>`;
            uploadBtn.disabled = false;
        }
    }
};

window.CapabilityUpload = CapabilityUpload;
