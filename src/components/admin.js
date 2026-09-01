/**
 * DeckSum - Admin Dashboard View Component
 */

import { api } from '../utils/api.js';

export async function renderAdmin(container, app) {
    // 1. Initial Loading Spinner
    container.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 60px 0; gap:16px;">
            <div class="loader-spinner" style="width:36px; height:36px;"></div>
            <p style="color:var(--text-muted); font-size:0.9rem;">Gathering system configuration data...</p>
        </div>
    `;

    try {
        // 2. Fetch admin stats and users in parallel
        const [stats, users] = await Promise.all([
            api.request('/api/admin/stats'),
            api.request('/api/admin/users')
        ]);

        const loggedInUsername = api.getUsername();

        // 3. Render HTML Layout
        container.innerHTML = `
            <div class="admin-container" style="display:flex; flex-direction:column; gap:28px;">
                
                <!-- User Directory & Governance Card -->
                <div class="glass-card">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px; margin-bottom:20px;">
                        <div>
                            <h3 style="display:flex; align-items:center; gap:8px;">
                                <i data-lucide="shield" style="color:var(--accent-primary);"></i>
                                User Directory & Governance
                            </h3>
                            <p style="color:var(--text-secondary); font-size:0.85rem; margin-top:4px;">
                                Review system usage, promote user accounts, or wipe accounts in compliance with privacy guidelines.
                            </p>
                        </div>
                        
                        <!-- Search Users Input -->
                        <div style="position:relative; width:100%; max-width:300px;">
                            <input type="text" id="admin-user-search" class="form-input" placeholder="Search accounts..." style="width:100%; padding-left:36px; height:38px; font-size:0.85rem;">
                            <i data-lucide="search" style="position:absolute; left:12px; top:11px; width:16px; height:16px; color:var(--text-muted);"></i>
                        </div>
                    </div>

                    <!-- Users Table Container -->
                    <div class="admin-table-container" style="overflow-x:auto;">
                        <table class="admin-table" style="width:100%; border-collapse:collapse; text-align:left; font-size:0.9rem;">
                            <thead>
                                <tr style="border-bottom:1px solid var(--border-color); color:var(--text-secondary); font-weight:600;">
                                    <th style="padding:14px 8px;">User ID</th>
                                    <th style="padding:14px 8px;">Username</th>
                                    <th style="padding:14px 8px;">Joined Date</th>
                                    <th style="padding:14px 8px;">System Role</th>
                                    <th style="padding:14px 8px; text-align:right;">Control Actions</th>
                                </tr>
                            </thead>
                            <tbody id="admin-users-tbody">
                                <!-- Users rendered dynamically -->
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- System Maintenance Card -->
                <div class="glass-card" style="border-color: rgba(239, 68, 68, 0.25);">
                    <h3 style="display:flex; align-items:center; gap:8px; color:var(--color-danger); margin-bottom:8px;">
                        <i data-lucide="alert-octagon"></i>
                        Critical Maintenance & Database backup
                    </h3>
                    <p style="color:var(--text-secondary); font-size:0.85rem; margin-bottom:20px;">
                        Perform system-wide administrative maintenance. These options impact the entire database storage.
                    </p>
                    
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; flex-wrap:wrap;">
                        <!-- Backup Options -->
                        <div style="display:flex; justify-content:space-between; align-items:center; padding:16px; background:rgba(255,255,255,0.01); border-radius:var(--border-radius-sm); border:1px solid var(--border-color);">
                            <div>
                                <div style="font-weight:600; font-size:0.9rem;">Database Backup Export</div>
                                <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">Download a point-in-time JSON metadata backup sheet.</div>
                            </div>
                            <button class="btn-primary" id="btn-admin-backup" style="padding:8px 16px; font-size:0.8rem; background:linear-gradient(90deg, var(--accent-secondary) 0%, var(--accent-primary) 100%); box-shadow:none;">
                                Export Backup
                            </button>
                        </div>
                        
                        <!-- Factory Reset Options -->
                        <div style="display:flex; justify-content:space-between; align-items:center; padding:16px; background:rgba(239, 68, 68, 0.02); border-radius:var(--border-radius-sm); border:1px solid rgba(239, 68, 68, 0.15);">
                            <div>
                                <div style="font-weight:600; font-size:0.9rem; color:var(--color-danger);">System Factory Reset</div>
                                <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">Wipe all user records, documents, and cards. Only your account is kept.</div>
                            </div>
                            <button class="btn-primary" id="btn-admin-reset" style="background:var(--color-danger); box-shadow:none; padding:8px 16px; font-size:0.8rem;">
                                Factory Reset
                            </button>
                        </div>
                    </div>
                </div>

            </div>
        `;

        const tbody = document.getElementById('admin-users-tbody');
        const searchInput = document.getElementById('admin-user-search');
        const backupBtn = document.getElementById('btn-admin-backup');
        const resetBtn = document.getElementById('btn-admin-reset');

        // 4. Render User List Table Body
        function renderUserRows(filterQuery = '') {
            const filtered = users.filter(u => 
                u.username.toLowerCase().includes(filterQuery.toLowerCase()) ||
                u.id.toString().includes(filterQuery)
            );

            if (filtered.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="5" style="text-align:center; padding:32px; color:var(--text-muted); font-style:italic;">
                            No matching user accounts found.
                        </td>
                    </tr>
                `;
                return;
            }

            tbody.innerHTML = filtered.map(u => {
                const isSelf = u.username.toLowerCase() === loggedInUsername.toLowerCase();
                const joinedDate = u.createdAt ? formatDate(u.createdAt) : 'Unknown';
                const roleBadgeClass = u.isAdmin ? 'due-status-badge upcoming' : 'due-status-badge';
                const roleBadgeStyle = u.isAdmin 
                    ? 'border-color:var(--color-success); color:var(--color-success); background:rgba(34, 197, 94, 0.06); font-weight:700;' 
                    : 'border-color:var(--border-color); color:var(--text-secondary); background:transparent;';

                return `
                    <tr style="border-bottom:1px solid var(--border-color); vertical-align:middle; transition: background 0.2s ease;">
                        <td style="padding:14px 8px; color:var(--text-muted); font-family:monospace;">#${u.id}</td>
                        <td style="padding:14px 8px;">
                            <div style="display:flex; align-items:center; gap:10px;">
                                <div class="avatar" style="width:30px; height:30px; font-size:0.75rem; background: ${isSelf ? 'linear-gradient(135deg, var(--accent-primary), var(--accent-tertiary))' : 'var(--border-color)'}">
                                    ${u.username.substring(0, 2).toUpperCase()}
                                </div>
                                <span style="font-weight:600; color: ${isSelf ? 'var(--accent-secondary)' : 'var(--text-primary)'}">
                                    ${u.username} ${isSelf ? '<span style="font-size:0.75rem; color:var(--text-muted); font-weight:normal;">(You)</span>' : ''}
                                </span>
                            </div>
                        </td>
                        <td style="padding:14px 8px; color:var(--text-secondary);">${joinedDate}</td>
                        <td style="padding:14px 8px;">
                            <span class="${roleBadgeClass}" style="${roleBadgeStyle} padding:4px 8px; font-size:0.75rem; border-radius:12px;">
                                ${u.isAdmin ? 'Admin' : 'Scholar'}
                            </span>
                        </td>
                        <td style="padding:14px 8px; text-align:right;">
                            <div style="display:flex; justify-content:flex-end; gap:6px;">
                                <button class="btn-icon" data-admin-toggle-id="${u.id}" title="${u.isAdmin ? 'Demote User' : 'Promote User'}" ${isSelf ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''}>
                                    <i data-lucide="${u.isAdmin ? 'shield-off' : 'shield-alert'}" style="width:16px; height:16px; color:${isSelf ? 'var(--text-muted)' : 'var(--accent-primary)'}"></i>
                                </button>
                                <button class="btn-icon danger" data-admin-delete-id="${u.id}" title="Delete User Account" ${isSelf ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''}>
                                    <i data-lucide="trash-2" style="width:16px; height:16px;"></i>
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');

            // Attach user action event listeners
            attachRowActionListeners();
            if (window.lucide) window.lucide.createIcons();
        }

        // 5. Row buttons handlers
        function attachRowActionListeners() {
            // Toggle Admin Action
            const adminToggles = tbody.querySelectorAll('[data-admin-toggle-id]');
            adminToggles.forEach(btn => {
                btn.addEventListener('click', async () => {
                    const id = parseInt(btn.getAttribute('data-admin-toggle-id'));
                    const targetUser = users.find(u => u.id === id);
                    if (!targetUser) return;

                    const actionName = targetUser.isAdmin ? 'demote' : 'promote';
                    const confirmMsg = `Are you sure you want to ${actionName} "${targetUser.username}" to ${targetUser.isAdmin ? 'Scholar' : 'Administrator'} status?`;
                    
                    if (confirm(confirmMsg)) {
                        try {
                            const res = await api.request(`/api/admin/users/${id}/toggle-admin`, { method: 'POST' });
                            targetUser.isAdmin = res.isAdmin;
                            alert(`"${targetUser.username}" is now ${res.isAdmin ? 'an Administrator' : 'a Scholar'}.`);
                            renderUserRows(searchInput.value);
                        } catch (err) {
                            alert(`Failed to update role: ${err.message}`);
                        }
                    }
                });
            });

            // Delete User Action
            const deleteButtons = tbody.querySelectorAll('[data-admin-delete-id]');
            deleteButtons.forEach(btn => {
                btn.addEventListener('click', async () => {
                    const id = parseInt(btn.getAttribute('data-admin-delete-id'));
                    const targetUser = users.find(u => u.id === id);
                    if (!targetUser) return;

                    const confirmMsg = `WARNING: You are about to permanently delete the account of "${targetUser.username}" and all their study materials, flashcards, quiz scores, and study time logs.\n\nThis action is irreversible. Do you wish to proceed?`;
                    
                    if (confirm(confirmMsg)) {
                        try {
                            const res = await api.request(`/api/admin/users/${id}`, { method: 'DELETE' });
                            alert(res.message);
                            // Remove user locally and re-render
                            const index = users.findIndex(u => u.id === id);
                            if (index !== -1) users.splice(index, 1);
                            renderUserRows(searchInput.value);
                        } catch (err) {
                            alert(`Failed to delete user: ${err.message}`);
                        }
                    }
                });
            });
        }

        // Initialize table rows
        renderUserRows();

        // Attach search input listener
        searchInput.addEventListener('input', (e) => {
            renderUserRows(e.target.value);
        });

        // 6. Backup Export Event Handler
        backupBtn.addEventListener('click', () => {
            try {
                const backupPayload = {
                    backupTimestamp: new Date().toISOString(),
                    systemOverview: stats,
                    usersMetadata: users.map(u => ({
                        id: u.id,
                        username: u.username,
                        createdAt: u.createdAt,
                        isAdmin: u.isAdmin,
                        documentCount: u.documentCount,
                        cardCount: u.cardCount,
                        totalMinutes: u.totalStudyMinutes
                    }))
                };

                const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupPayload, null, 2));
                const downloadAnchor = document.createElement('a');
                downloadAnchor.setAttribute("href", dataStr);
                downloadAnchor.setAttribute("download", `decksum_backup_${new Date().toISOString().slice(0, 10)}.json`);
                document.body.appendChild(downloadAnchor);
                downloadAnchor.click();
                downloadAnchor.remove();
            } catch (err) {
                alert(`Failed to export backup: ${err.message}`);
            }
        });

        // 7. System Reset Handler
        resetBtn.addEventListener('click', async () => {
            const warning = `🚨 DANGER: FACTORY RESET 🚨\n\nYou are about to execute a factory reset of the system database.\n\nThis action will:\n1. Delete ALL uploaded files and documents.\n2. Delete ALL revision flashcards.\n3. Delete ALL test history and records.\n4. Delete ALL other registered student accounts.\n\nOnly your active administrator account will be spared.\n\nTHIS ACTION IS FULLY IRREVERSIBLE. Type "RESET" in the next prompt if you are absolutely sure.`;
            
            if (confirm(warning)) {
                const confirmationText = prompt('Type "RESET" to confirm factory wipe:');
                if (confirmationText === "RESET") {
                    try {
                        resetBtn.disabled = true;
                        resetBtn.textContent = "Wiping Data...";
                        const res = await api.request('/api/admin/system/factory-reset', { method: 'POST' });
                        alert(res.message);
                        
                        // Force reload page to refresh global state
                        window.location.reload();
                    } catch (err) {
                        alert(`Failed to perform factory reset: ${err.message}`);
                        resetBtn.disabled = false;
                        resetBtn.textContent = "Factory Reset";
                    }
                } else {
                    alert("Wipe aborted. Confirmation input mismatch.");
                }
            }
        });

        if (window.lucide) window.lucide.createIcons();

    } catch (err) {
        console.error("Admin dashboard render failed:", err);
        container.innerHTML = `
            <div class="glass-card" style="border-color:var(--color-danger); text-align:center; padding:30px;">
                <i data-lucide="alert-octagon" style="color:var(--color-danger); width:40px; height:40px; margin-bottom:12px;"></i>
                <h3>Failed to load administrator dashboard</h3>
                <p style="color:var(--text-secondary); margin-top:6px;">${err.message}</p>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
    }
}

// Format Date Utility
function formatDate(isoStr) {
    try {
        const date = new Date(isoStr);
        if (isNaN(date.getTime())) return isoStr;
        return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
        return isoStr;
    }
}

// Format Bytes Utility
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
