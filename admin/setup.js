const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const db = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'bolt_admin',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
});

async function setupDatabase() {
  console.log('🔧 Setting up Bolt.gives Admin Panel...');

  try {
    // Create database schema
    console.log('📊 Creating database schema...');
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await db.query(schema);
    console.log('✅ Database schema created successfully');

    // Create default admin user
    console.log('👤 Creating default admin user...');
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@openweb.live';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123456';
    
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(adminPassword, saltRounds);

    await db.query(`
      INSERT INTO admin_users (email, password_hash, role, permissions)
      VALUES ($1, $2, 'super_admin', $3)
      ON CONFLICT (email) DO UPDATE SET
        password_hash = $2,
        role = 'super_admin',
        permissions = $3
    `, [
      adminEmail,
      passwordHash,
      JSON.stringify(['*']) // All permissions
    ]);

    console.log(`✅ Admin user created: ${adminEmail}`);
    console.log(`🔑 Default password: ${adminPassword}`);
    console.log('⚠️  IMPORTANT: Change the default password after first login!');

    // Insert sample server (localhost)
    console.log('🖥️  Adding default server configuration...');
    await db.query(`
      INSERT INTO servers (name, hostname, ip_address, port, capacity, is_default, region, status)
      VALUES ('Local Server', 'localhost', '127.0.0.1', 22, 50, true, 'local', 'active')
      ON CONFLICT (hostname) DO UPDATE SET
        is_default = true,
        status = 'active'
    `);

    console.log('✅ Default server configuration added');

    // Create logs directory
    console.log('📁 Creating logs directory...');
    if (!fs.existsSync('logs')) {
      fs.mkdirSync('logs');
    }
    console.log('✅ Logs directory created');

    console.log('\n🎉 Setup completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('1. Start the admin panel: npm start');
    console.log('2. Open http://localhost:3001 in your browser');
    console.log(`3. Login with ${adminEmail} and password: ${adminPassword}`);
    console.log('4. Change the default admin password');
    console.log('5. Configure your servers in the Servers section');
    console.log('6. Start accepting user registrations');

  } catch (error) {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  } finally {
    await db.end();
  }
}

// Handle command line arguments
const args = process.argv.slice(2);
if (args.includes('--reset')) {
  console.log('⚠️  Resetting database - all data will be lost!');
  console.log('Press Ctrl+C within 5 seconds to cancel...');
  setTimeout(async () => {
    try {
      await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
      console.log('🗑️  Database reset completed');
      await setupDatabase();
    } catch (error) {
      console.error('❌ Reset failed:', error);
      process.exit(1);
    }
  }, 5000);
} else {
  setupDatabase();
}