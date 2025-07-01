const axios = require('axios');
const sqlite3 = require('sqlite3');
const crypto = require('crypto');
const readline = require('readline');

// Database setup
const db = new sqlite3.Database('tokens.db');

// Create table if it doesn't exist
db.run('CREATE TABLE IF NOT EXISTS tokens (token TEXT PRIMARY KEY)');

// Create readline interface for CLI
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Function to generate a secure random token
function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

// Function to add token to database
function addTokenToDatabase(token) {
    return new Promise((resolve, reject) => {
        db.run('INSERT INTO tokens (token) VALUES (?)', [token], function(err) {
            if (err) {
                reject(err);
            } else {
                resolve(token);
            }
        });
    });
}

// Function to list all tokens from database
function listTokensFromDatabase() {
    return new Promise((resolve, reject) => {
        db.all('SELECT token FROM tokens', [], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows.map(row => row.token));
            }
        });
    });
}

// Function to delete token from database
function deleteTokenFromDatabase(token) {
    return new Promise((resolve, reject) => {
        db.run('DELETE FROM tokens WHERE token = ?', [token], function(err) {
            if (err) {
                reject(err);
            } else {
                resolve(this.changes > 0);
            }
        });
    });
}

// Function to clear all tokens from database
function clearAllTokens() {
    return new Promise((resolve, reject) => {
        db.run('DELETE FROM tokens', [], function(err) {
            if (err) {
                reject(err);
            } else {
                resolve(this.changes);
            }
        });
    });
}

// Generate and store a new token
async function generateAndStoreToken() {
    try {
        const token = generateToken();
        await addTokenToDatabase(token);
        console.log('\n✅ Generated new token:', token);
        console.log('Token added to database successfully\n');
        return token;
    } catch (error) {
        console.error('\n❌ Error generating/storing token:', error.message);
        throw error;
    }
}

// List all stored tokens
async function listStoredTokens() {
    try {
        const tokens = await listTokensFromDatabase();
        console.log('\n📋 Stored tokens:');
        if (tokens.length === 0) {
            console.log('No tokens found in database.\n');
        } else {
            tokens.forEach((token, index) => {
                console.log(`${index + 1}. ${token}`);
            });
            console.log(`\nTotal: ${tokens.length} token(s)\n`);
        }
        return tokens;
    } catch (error) {
        console.error('\n❌ Error listing tokens:', error.message);
        throw error;
    }
}

// Delete a specific token
async function deleteToken(token) {
    try {
        const deleted = await deleteTokenFromDatabase(token);
        if (deleted) {
            console.log('\n✅ Token deleted successfully\n');
        } else {
            console.log('\n⚠️ Token not found in database\n');
        }
        return deleted;
    } catch (error) {
        console.error('\n❌ Error deleting token:', error.message);
        throw error;
    }
}

// Clear all tokens
async function clearTokens() {
    try {
        const deletedCount = await clearAllTokens();
        console.log(`\n✅ Cleared ${deletedCount} token(s) from database\n`);
        return deletedCount;
    } catch (error) {
        console.error('\n❌ Error clearing tokens:', error.message);
        throw error;
    }
}

// Display menu
function displayMenu() {
    console.log('\n🔑 Token Management CLI');
    console.log('======================');
    console.log('1. Generate new token');
    console.log('2. List all tokens');
    console.log('3. Delete specific token');
    console.log('4. Clear all tokens');
    console.log('5. Exit');
    console.log('======================');
}

// Get user input
function getUserInput(prompt) {
    return new Promise((resolve) => {
        rl.question(prompt, (answer) => {
            resolve(answer.trim());
        });
    });
}

// Main CLI loop
async function runCLI() {
    console.log('\n🚀 Welcome to Token Management CLI for Image Download API');
    
    while (true) {
        displayMenu();
        const choice = await getUserInput('Enter your choice (1-5): ');
        
        switch (choice) {
            case '1':
                await generateAndStoreToken();
                break;
            
            case '2':
                await listStoredTokens();
                break;
            
            case '3':
                const tokens = await listTokensFromDatabase();
                if (tokens.length === 0) {
                    console.log('\n⚠️ No tokens available to delete\n');
                    break;
                }
                
                console.log('\nAvailable tokens:');
                tokens.forEach((token, index) => {
                    console.log(`${index + 1}. ${token}`);
                });
                
                const tokenChoice = await getUserInput('\nEnter token number to delete (or press Enter to cancel): ');
                if (tokenChoice && !isNaN(tokenChoice)) {
                    const tokenIndex = parseInt(tokenChoice) - 1;
                    if (tokenIndex >= 0 && tokenIndex < tokens.length) {
                        await deleteToken(tokens[tokenIndex]);
                    } else {
                        console.log('\n⚠️ Invalid token number\n');
                    }
                } else if (tokenChoice !== '') {
                    console.log('\n⚠️ Invalid input\n');
                }
                break;
            
            case '4':
                const confirm = await getUserInput('Are you sure you want to clear ALL tokens? (y/N): ');
                if (confirm.toLowerCase() === 'y' || confirm.toLowerCase() === 'yes') {
                    await clearTokens();
                } else {
                    console.log('\n⚠️ Operation cancelled\n');
                }
                break;
            
            case '5':
                console.log('\n👋 Goodbye!');
                rl.close();
                db.close();
                process.exit(0);
                break;
            
            default:
                console.log('\n⚠️ Invalid choice. Please select 1-5.\n');
                break;
        }
    }
}

// Handle process termination
process.on('SIGINT', () => {
    console.log('\n\n👋 Goodbye!');
    rl.close();
    db.close();
    process.exit(0);
});

// Start the CLI
runCLI().catch((error) => {
    console.error('\n❌ CLI Error:', error.message);
    rl.close();
    db.close();
    process.exit(1);
});
