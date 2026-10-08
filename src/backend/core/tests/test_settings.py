"""
Unit tests for the User model
"""

import json

import pytest

from impress.settings import Base, EmbedProvidersValue


def test_invalid_settings_oidc_email_configuration():
    """
    The OIDC_FALLBACK_TO_EMAIL_FOR_IDENTIFICATION and OIDC_ALLOW_DUPLICATE_EMAILS settings
    should not be both set to True simultaneously.
    """

    class TestSettings(Base):
        """Fake test settings."""

        OIDC_FALLBACK_TO_EMAIL_FOR_IDENTIFICATION = True
        OIDC_ALLOW_DUPLICATE_EMAILS = True

    # The validation is performed during post_setup
    with pytest.raises(ValueError) as excinfo:
        TestSettings().post_setup()

    # Check the exception message
    assert str(excinfo.value) == (
        "Both OIDC_FALLBACK_TO_EMAIL_FOR_IDENTIFICATION and "
        "OIDC_ALLOW_DUPLICATE_EMAILS cannot be set to True simultaneously. "
    )


def test_settings_psycopg_pool_not_enabled():
    """
    Test that not changing DB_PSYCOPG_POOL_ENABLED should not configure psycopg in the DATABASES
    settings.
    """

    class TestSettings(Base):
        """Fake test settings without enabling psycopg"""

    TestSettings.post_setup()

    assert TestSettings.DATABASES["default"].get("OPTIONS") == {}


def test_settings_psycopg_pool_enabled(monkeypatch):
    """
    Test when DB_PSYCOPG_POOL_ENABLED is set to True, the psycopg pool options should be present
    in the DATABASES OPTIONS.
    """

    monkeypatch.setenv("DB_PSYCOPG_POOL_ENABLED", "True")

    class TestSettings(Base):
        """Fake test settings without enabling psycopg"""

    TestSettings.post_setup()

    assert TestSettings.DATABASES["default"].get("OPTIONS") == {
        "pool": {
            "min_size": 4,
            "max_size": None,
            "timeout": 3,
        }
    }


def test_embed_providers_value_parses_json():
    """EMBED_PROVIDERS comes from the environment as a JSON list."""
    value = EmbedProvidersValue([])
    providers = value.to_python(
        '[{"id": "grist", "pattern": "^https://grist\\\\.example\\\\.com/(\\\\w+)$",'
        ' "src": "https://grist.example.com/{1}?embed=true"}]'
    )
    assert providers == [
        {
            "id": "grist",
            "pattern": r"^https://grist\.example\.com/(\w+)$",
            "src": "https://grist.example.com/{1}?embed=true",
        }
    ]


@pytest.mark.parametrize(
    "raw",
    [
        '{"id": "grist"}',
        "not json",
    ],
)
def test_embed_providers_value_ignores_a_bad_value(raw):
    """A broken value is dropped instead of stopping the startup."""
    assert EmbedProvidersValue([]).to_python(raw) == []


def test_embed_providers_value_drops_only_the_bad_entries():
    """Valid providers survive next to broken ones."""
    good = {
        "id": "ok",
        "pattern": "^https://ok[.]example/(\\w+)",
        "src": "https://ok.example/{1}",
    }
    raw = json.dumps(
        [
            good,
            {"id": "grist", "pattern": "x"},
            {"id": "http", "pattern": "x", "src": "http://x.example/{1}"},
            {"id": "broken", "pattern": "(", "src": "https://x.example/{1}"},
        ]
    )
    assert EmbedProvidersValue([]).to_python(raw) == [good]
