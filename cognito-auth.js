// Function to handle form submission for login
function handleLogin(event) {
    event.preventDefault();
    
    try {
        // Hide any previous error messages
        document.getElementById('loginErrorMessage').style.display = 'none';
        
        // Directly initiate authentication with Cognito
        initiateAuth();
    } catch (error) {
        console.error('Login error:', error);
        const errorMessage = document.getElementById('loginErrorMessage');
        errorMessage.textContent = '로그인 처리 중 오류가 발생했습니다. 다시 시도해주세요.';
        errorMessage.style.display = 'block';
    }
} 