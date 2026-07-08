"""Tests for src.auth.clerk — Authentication, JWT handling, role-based access."""
import pytest
from unittest.mock import MagicMock, patch
from src.auth.clerk import decode_token, get_jwks, CLERK_SECRET_KEY, CLERK_PUBLISHABLE_KEY


class TestClerkAuth:
    def test_decode_token_dev_mode(self):
        """In dev mode (no JWKS), tokens are decoded without verification."""
        import jwt
        token = jwt.encode({"sub": "user-1", "email": "test@test.com"}, "secret", algorithm="HS256")
        with patch("src.auth.clerk.CLERK_SECRET_KEY", ""):
            with patch("src.auth.clerk.get_jwks", return_value=None):
                payload = decode_token(token)
                assert payload["sub"] == "user-1"
                assert payload["email"] == "test@test.com"

    def test_decode_token_invalid(self):
        with patch("src.auth.clerk.get_jwks", return_value=None):
            with pytest.raises(Exception):
                decode_token("invalid.token.here")

    def test_get_jwks_no_secret(self):
        with patch("src.auth.clerk.CLERK_SECRET_KEY", ""):
            result = get_jwks()
            assert result is None

    def test_decode_token_with_jwks(self):
        """Test decode with mock JWKS keys."""
        import json as _json
        import jwt as pyjwt
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric import rsa

        # Generate a test RSA key pair
        private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        private_key_pem = private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
        public_key = private_key.public_key()
        public_key_pem = public_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )

        # Create token with private key
        token = pyjwt.encode(
            {"sub": "user-123", "email": "dev@volt.os"},
            private_key_pem,
            algorithm="RS256",
            headers={"kid": "test-key-id"},
        )

        # Mock JWKS - build a valid JWK dict manually
        from cryptography.hazmat.primitives.asymmetric.rsa import RSAPublicNumbers
        from cryptography.hazmat.backends import default_backend
        import base64

        pub_numbers = public_key.public_numbers()

        def _int_to_b64url(n):
            byte_length = (n.bit_length() + 7) // 8
            n_bytes = n.to_bytes(byte_length, byteorder='big')
            return base64.urlsafe_b64encode(n_bytes).rstrip(b'=').decode('ascii')

        jwk_dict = {
            "kty": "RSA",
            "kid": "test-key-id",
            "n": _int_to_b64url(pub_numbers.n),
            "e": _int_to_b64url(pub_numbers.e),
            "alg": "RS256",
            "use": "sig",
        }

        with patch("src.auth.clerk.CLERK_SECRET_KEY", "test-secret"):
            with patch("src.auth.clerk.get_jwks", return_value=[jwk_dict]):
                payload = decode_token(token)
                assert payload["sub"] == "user-123"

    def test_decode_token_unknown_kid(self):
        """Test decode with a key ID not in JWKS."""
        import jwt as pyjwt
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        import base64

        private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        private_key_pem = private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )

        token = pyjwt.encode(
            {"sub": "user-456"},
            private_key_pem,
            algorithm="RS256",
            headers={"kid": "unknown-key"},
        )

        jwk_dict = {"kty": "RSA", "kid": "other-key", "n": "abc", "e": "AQAB", "alg": "RS256", "use": "sig"}

        with patch("src.auth.clerk.CLERK_SECRET_KEY", "test"):
            with patch("src.auth.clerk.get_jwks", return_value=[jwk_dict]):
                with pytest.raises(Exception):
                    decode_token(token)

    def test_get_jwks_exception(self):
        """Test that get_jwks returns [] on network error."""
        import src.auth.clerk as clerk_mod
        # Clear the lru_cache
        clerk_mod.get_jwks.cache_clear()
        with patch.object(clerk_mod, "CLERK_SECRET_KEY", "test-key"):
            with patch.object(clerk_mod.httpx, "get", side_effect=Exception("network error")):
                # Need to clear cache again after patching
                clerk_mod.get_jwks.cache_clear()
                result = clerk_mod.get_jwks()
                assert result == []

    def test_module_constants_exist(self):
        assert isinstance(CLERK_SECRET_KEY, str)
        assert isinstance(CLERK_PUBLISHABLE_KEY, str)
