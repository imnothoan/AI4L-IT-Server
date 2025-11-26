
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load env vars
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

console.log('Testing Supabase Connection...');
console.log('URL:', process.env.SUPABASE_URL);
console.log('Key exists:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);

async function testConnection() {
    try {
        console.log('Attempting to fetch users...');
        const { data, error } = await supabase
            .from('users')
            .select('count', { count: 'exact', head: true });

        if (error) {
            console.error('Supabase Error:', error);
            process.exit(1);
        }

        console.log('Connection Successful!');
        console.log('User count check result:', data);

        // Try to fetch one user to verify read permissions
        const { data: users, error: userError } = await supabase
            .from('users')
            .select('email, role')
            .limit(5);

        if (userError) {
            console.error('Error fetching users:', userError);
        } else {
            console.log('Successfully fetched users:', users);
        }

    } catch (err) {
        console.error('Unexpected error:', err);
        process.exit(1);
    }
}

testConnection();
