const { Pool } = require('pg');
require('dotenv').config();

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function testConnection() {
  console.log('🔄 Testing database connection...');
  
  try {
    // Test connection
    const client = await db.connect();
    console.log('✅ Database connection successful!');
    
    // Test admin user exists
    const adminTest = await client.query('SELECT email FROM admin_users WHERE role = $1', ['super_admin']);
    console.log(`👤 Admin users found: ${adminTest.rows.length}`);
    if (adminTest.rows.length > 0) {
      console.log(`📧 Admin email: ${adminTest.rows[0].email}`);
    }
    
    // Test table structure
    const tablesTest = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log('📊 Database tables:');
    tablesTest.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });
    
    // Test server configuration
    const serverTest = await client.query('SELECT name, hostname, status FROM servers');
    console.log(`🖥️  Servers configured: ${serverTest.rows.length}`);
    serverTest.rows.forEach(server => {
      console.log(`  - ${server.name} (${server.hostname}) - ${server.status}`);
    });
    
    client.release();
    
    console.log('\n🎉 Database is ready for admin panel!');
    console.log('\n📋 Next steps:');
    console.log('1. Start admin panel: node server.js');
    console.log('2. Access: http://localhost:3001');
    console.log('3. Login: admin@openweb.live / BoltAdmin2024!');
    
  } catch (error) {
    console.error('❌ Database test failed:', error.message);
    if (error.code === 'ENOTFOUND') {
      console.error('🌐 Cannot connect to database host');
    }
    if (error.code === '28P01') {
      console.error('🔐 Authentication failed');
    }
  } finally {
    await db.end();
  }
}

testConnection();