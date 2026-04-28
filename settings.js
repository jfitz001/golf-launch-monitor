const PASSWORD_MIN_LENGTH = 8;

function setStatus(id, message, isError = false) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = message;
    el.style.color = isError ? 'var(--danger)' : 'var(--success)';
}

function getCurrentIdentityUser() {
    return netlifyIdentity?.currentUser?.() || null;
}

window.addEventListener('load', () => {
    const user = getCurrentIdentityUser();
    const resetEmail = document.getElementById('resetEmail');
    if (user?.email && resetEmail) {
        resetEmail.value = user.email;
    }
});

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
            await netlifyIdentity.requestPasswordRecovery(email);
            setStatus('resetStatus', 'Reset email sent. Check inbox.');
        } catch (error) {
            setStatus('resetStatus', error.message || 'Failed to send reset email.', true);
        } finally {
            sendResetBtn.disabled = false;
            sendResetBtn.textContent = 'Send Reset Email';
        }
    });
}
