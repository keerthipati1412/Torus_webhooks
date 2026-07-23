require('dotenv').config({ path: __dirname + '/.env' });
const { query } = require('./database');
const bcrypt = require('bcryptjs');

async function seedDatabase() {
    console.log('Initializing and seeding SQLite database...');
    
    const defaultPassword = await bcrypt.hash('admin123', 10);
    
    try {
        await query.run(
            'INSERT OR IGNORE INTO doctors (email, password, name) VALUES (?, ?, ?)',
            ['doctor@torus.com', defaultPassword, 'Dr. Torus Admin']
        );
        await query.run(
            'INSERT OR IGNORE INTO diagnostics (email, password, name) VALUES (?, ?, ?)',
            ['diagnostic@torus.com', defaultPassword, 'Torus Diagnostic Center']
        );
        console.log('Successfully seeded SQLite database with default accounts:');
        console.log(' - Doctor: doctor@torus.com / admin123');
        console.log(' - Diagnostic: diagnostic@torus.com / admin123');
    } catch (err) {
        console.error('Error seeding default accounts:', err.message);
    }
    process.exit(0);
}

seedDatabase();
