
import axios from 'axios';

const API_URL = 'http://localhost:3000/api/auth/register';

async function testRegistration() {
    try {
        const response = await axios.post(API_URL, {
            email: `test_${Date.now()}@example.com`,
            password: 'password123',
            name: 'Test User',
            role: 'student'
        });
        console.log('Registration successful:', response.data);
    } catch (error: any) {
        console.error('Registration failed:', error.response ? error.response.data : error.message);
    }
}

testRegistration();
