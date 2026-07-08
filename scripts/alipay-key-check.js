require('dotenv').config();

const crypto = require('crypto');

function wrapPem(value, type) {
  const raw = String(value || '').replace(/\\n/g, '\n').trim();
  if (!raw) return '';
  if (raw.includes('-----BEGIN')) return raw;

  const compact = raw.replace(/\s+/g, '');
  const lines = compact.match(/.{1,64}/g) || [];
  return [
    `-----BEGIN ${type}-----`,
    ...lines,
    `-----END ${type}-----`
  ].join('\n');
}

function normalizePrivateKey(value, keyType) {
  return wrapPem(value, keyType === 'PKCS1' ? 'RSA PRIVATE KEY' : 'PRIVATE KEY');
}

function parsePrivateKey(value, configuredKeyType) {
  const raw = String(value || '').replace(/\\n/g, '\n').trim();
  const normalizedConfiguredKeyType = configuredKeyType === 'PKCS1' ? 'PKCS1' : 'PKCS8';
  if (!raw) {
    throw new Error('Missing ALIPAY_PRIVATE_KEY in .env');
  }

  const candidates = [];
  if (raw.includes('-----BEGIN RSA PRIVATE KEY-----')) {
    candidates.push({ keyType: 'PKCS1', privateKey: raw });
  } else if (raw.includes('-----BEGIN PRIVATE KEY-----')) {
    candidates.push({ keyType: 'PKCS8', privateKey: raw });
  } else if (raw.includes('-----BEGIN ENCRYPTED PRIVATE KEY-----')) {
    throw new Error('ALIPAY_PRIVATE_KEY is encrypted. Use an unencrypted Alipay app private key.');
  } else if (raw.includes('-----BEGIN')) {
    throw new Error('ALIPAY_PRIVATE_KEY is not a supported RSA private key. Use PKCS8 or PKCS1.');
  } else {
    const firstType = normalizedConfiguredKeyType;
    const secondType = firstType === 'PKCS8' ? 'PKCS1' : 'PKCS8';
    candidates.push({ keyType: firstType, privateKey: normalizePrivateKey(raw, firstType) });
    candidates.push({ keyType: secondType, privateKey: normalizePrivateKey(raw, secondType) });
  }

  const errors = [];
  for (const candidate of candidates) {
    try {
      const privateKeyObject = crypto.createPrivateKey(candidate.privateKey);
      return { ...candidate, privateKeyObject };
    } catch (error) {
      errors.push(`${candidate.keyType}: ${error.message}`);
    }
  }

  throw new Error(`ALIPAY_PRIVATE_KEY cannot be decoded. ${errors.join(' | ')}`);
}

function sha256Base64(value) {
  return crypto.createHash('sha256').update(value).digest('base64');
}

function main() {
  const appId = String(process.env.ALIPAY_APP_ID || '').trim();
  const keyType = String(process.env.ALIPAY_KEY_TYPE || 'PKCS8').trim().toUpperCase() === 'PKCS1'
    ? 'PKCS1'
    : 'PKCS8';
  const { keyType: detectedKeyType, privateKeyObject } = parsePrivateKey(process.env.ALIPAY_PRIVATE_KEY, keyType);
  const publicKey = crypto.createPublicKey(privateKeyObject).export({
    type: 'spki',
    format: 'pem'
  });

  const sample = `alipay-key-check:${Date.now()}`;
  const signature = crypto.createSign('RSA-SHA256').update(sample, 'utf8').sign(privateKeyObject, 'base64');
  const verified = crypto.createVerify('RSA-SHA256').update(sample, 'utf8').verify(publicKey, signature, 'base64');

  console.log('Alipay key check');
  console.log('----------------');
  console.log(`App ID: ${appId || '(missing)'}`);
  console.log(`Configured key type: ${keyType}`);
  console.log(`Detected key type: ${detectedKeyType}`);
  console.log(`Derived app public key SHA256: ${sha256Base64(publicKey)}`);
  console.log(`Self verify RSA2: ${verified ? 'OK' : 'FAILED'}`);
  console.log('');
  console.log('Derived app public key. This must match the app public key configured for this App ID in Alipay Open Platform:');
  console.log(publicKey);
}

try {
  main();
} catch (error) {
  console.error('Alipay key check failed:', error.message);
  process.exitCode = 1;
}
