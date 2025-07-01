# Image Download API

A secure Express.js API service for downloading and serving images with token-based authentication and usage tracking.

## Features

- **Secure Image Downloads**: Download images from URLs and store them locally
- **Token-based Authentication**: SQLite database for token management and usage tracking
- **Rate Limiting**: Built-in protection against abuse (1000 requests per 15 minutes)
- **File Serving**: UploadThing-style file serving with unique IDs
- **Security**: Helmet middleware, input validation, and error handling
- **Health Monitoring**: Health check endpoint with system status

## Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file:
```env
PORT=3000
HOST=http://localhost:3000
API_SECRET=your-secret-key
```

4. Start the server:
```bash
node index.js
```

## Token Management

Use the CLI tool to manage authentication tokens:

```bash
node gen.js
```

**CLI Options:**
- Generate new token
- List all tokens
- Delete specific token
- Clear all tokens

## API Endpoints

### Download Image
**POST** `/api/save`
- **Headers:** `Authorization: Bearer <token>`
- **Body:** `{ "url": "https://example.com/image.jpg" }`
- **Response:** `{ "status": "success", "fid": "abc123", "url": "http://localhost:3000/f/abc123" }`

### Serve File
**GET** `/f/:id`
- **Headers:** `Authorization: Bearer <token>`
- **Response:** Image file

### Health Check
**GET** `/health`
- **Response:** System status and metrics

## Usage Examples

### Download an image:
```bash
curl -X POST http://localhost:3000/api/save \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/image.jpg"}'
```

### Access downloaded image:
```bash
curl -H "Authorization: Bearer your-token" \
  http://localhost:3000/f/abc123
```

## Security Features

- **Rate Limiting**: 1000 requests per 15 minutes per IP
- **Input Validation**: URL validation and content-type checking
- **Error Handling**: Comprehensive error responses
- **File Cleanup**: Automatic cleanup of failed downloads
- **Token Tracking**: Usage count tracking per token

## File Storage

- Images are stored in the `files/` directory
- Unique 26-character IDs generated for each file
- Original file extensions preserved
- Automatic directory creation

## Dependencies

- `express` - Web framework
- `sqlite3` - Database
- `helmet` - Security middleware
- `express-rate-limit` - Rate limiting
- `dotenv` - Environment variables
- `axios` - HTTP client (for CLI)

## Error Handling

The API returns structured error responses:
```json
{
  "error": "Error message",
  "status": "error"
}
```

Common error codes:
- `400` - Bad request (invalid URL, missing parameters)
- `401` - Unauthorized (invalid/missing token)
- `404` - File not found
- `429` - Rate limit exceeded
- `500` - Internal server error
