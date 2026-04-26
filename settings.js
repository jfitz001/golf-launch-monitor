const PASSWORD_MIN_LENGTH = 8;

function setStatus(id, message, isError = false) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = message;
    el.style.color = isError ? 'var(--danger)' : 'var(--success)';
}

function getCurrentIdentityUser() {
    return window.netlifyIdentity?.currentUser?.() || null;
}

function getUserMetadata(user) {
    return user?.user_metadata || user?.app_metadata || user?.data || {};
}

window.addEventListener('load', () => {
    const user = getCurrentIdentityUser();
    const resetEmail = document.getElementById('resetEmail');
    if (user?.email && resetEmail) {
        resetEmail.value = user.email;
    }

    const handicapInput = document.getElementById('handicapInput');
    const metadataHandicap = getUserMetadata(user)?.handicap;
    if (metadataHandicap !== undefined && metadataHandicap !== null && metadataHandicap !== '') {
        localStorage.setItem('playerHandicap', String(metadataHandicap));
    }

    const savedHandicap = localStorage.getItem('playerHandicap');
    if (handicapInput && savedHandicap !== null) {
        handicapInput.value = savedHandicap;
    }
});

const saveHandicapBtn = document.getElementById('saveHandicapBtn');
if (saveHandicapBtn) {
    saveHandicapBtn.addEventListener('click', async () => {
        const input = document.getElementById('handicapInput');
        const rawValue = (input?.value || '').trim();
        if (!rawValue) {
            localStorage.removeItem('playerHandicap');
            try {
                const user = getCurrentIdentityUser();
                if (user?.update) {
                    const existingData = { ...getUserMetadata(user) };
                    delete existingData.handicap;
                    await user.update({ data: existingData });
                }
                setStatus('handicapStatus', 'Handicap cleared. Score uses default amateur scale.');
            } catch (error) {
                setStatus('handicapStatus', `Cleared locally. Cloud profile sync failed: ${error.message || 'unknown error'}`, true);
            }
            window.dispatchEvent(new CustomEvent('handicap:changed'));
            return;
        }

        const handicap = Number(rawValue);
        if (!Number.isFinite(handicap) || handicap < -5 || handicap > 54) {
            setStatus('handicapStatus', 'Enter handicap from -5 to 54.', true);
            return;
        }

        const normalizedHandicap = String(Math.round(handicap * 10) / 10);
        localStorage.setItem('playerHandicap', normalizedHandicap);
        if (input) input.value = localStorage.getItem('playerHandicap');
        const user = getCurrentIdentityUser();

        try {
            if (user?.update) {
                const existingData = getUserMetadata(user);
                await user.update({ data: { ...existingData, handicap: Number(normalizedHandicap) } });
            }
            setStatus('handicapStatus', `Saved. Swing score now calibrated to ${normalizedHandicap} handicap.`);
        } catch (error) {
            setStatus('handicapStatus', `Saved locally. Cloud profile sync failed: ${error.message || 'unknown error'}`, true);
        }
        window.dispatchEvent(new CustomEvent('handicap:changed'));

        if (typeof window.updateSwingScore === 'function') {
            window.updateSwingScore();
        }
    });
}

const changePasswordBtn = document.getElementById('changePasswordBtn');
if (changePasswordBtn) {
    changePasswordBtn.addEventListener('click', async () => {
        const user = getCurrentIdentityUser();
        if (!user) {
            setStatus('passwordStatus', 'Sign in required.', true);
            return;
        }

        const newPassword = document.getElementById('newPassword')?.value || '';
        const confirmPassword = document.getElementById('confirmPassword')?.value || '';

        if (newPassword.length < PASSWORD_MIN_LENGTH) {
            setStatus('passwordStatus', `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`, true);
            return;
        }

        if (newPassword !== confirmPassword) {
            setStatus('passwordStatus', 'Passwords do not match.', true);
            return;
        }

        changePasswordBtn.disabled = true;
        changePasswordBtn.textContent = 'Updating...';

        try {
            await user.update({ password: newPassword });
            document.getElementById('newPassword').value = '';
            document.getElementById('confirmPassword').value = '';
            setStatus('passwordStatus', 'Password updated.');
        } catch (error) {
            setStatus('passwordStatus', error.message || 'Failed to update password.', true);
        } finally {
            changePasswordBtn.disabled = false;
            changePasswordBtn.textContent = 'Update Password';
        }
    });
}

const sendResetBtn = document.getElementById('sendResetBtn');
if (sendResetBtn) {
    sendResetBtn.addEventListener('click', async () => {
        const email = (document.getElementById('resetEmail')?.value || '').trim();
        if (!email) {
            setStatus('resetStatus', 'Email required.', true);
            return;
        }

        sendResetBtn.disabled = true;
        sendResetBtn.textContent = 'Sending...';

        try {
            await window.netlifyIdentity.requestPasswordRecovery(email);
            setStatus('resetStatus', 'Reset email sent. Check inbox.');
        } catch (error) {
            setStatus('resetStatus', error.message || 'Failed to send reset email.', true);
        } finally {
            sendResetBtn.disabled = false;
            sendResetBtn.textContent = 'Send Reset Email';
        }
    });
}
