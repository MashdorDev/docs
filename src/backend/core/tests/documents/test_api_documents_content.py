"""
Tests for Documents API endpoint in impress's core app: replace the content
"""

from unittest.mock import patch

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from core import factories
from core.services.converter_services import (
    ServiceUnavailableError as YProviderServiceUnavailableError,
)
from core.services.converter_services import (
    ValidationError as YProviderValidationError,
)
from core.services.yhub_services import (
    ServiceUnavailableError as YHubServiceUnavailableError,
)

pytestmark = pytest.mark.django_db

CONVERTED = b"\x01\x02converted yjs update"


@pytest.fixture(autouse=True, name="mock_yhub")
def mock_yhub_fixture():
    """The content is written to the collaboration server, never to Django."""
    with patch("core.api.viewsets.YHubService") as mock_service:
        yield mock_service


@pytest.fixture(autouse=True, name="mock_convert")
def mock_convert_fixture():
    """Stand for the y-provider converting the markdown sent."""
    with patch("core.services.converter_services.YdocConverter.convert") as mock:
        mock.return_value = CONVERTED
        yield mock


def test_api_documents_content_anonymous(mock_yhub):
    """Anonymous users should not be allowed to replace the content of a document."""
    document = factories.DocumentFactory(link_reach="restricted")

    response = APIClient().put(
        f"/api/v1.0/documents/{document.id!s}/content/",
        {"content": "# Hello"},
        format="json",
    )

    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    mock_yhub.return_value.replace_ydoc.assert_not_called()


@pytest.mark.parametrize("role", ["reader", "commenter"])
def test_api_documents_content_without_edit_rights(role, mock_yhub):
    """Users who may only read a document should not be allowed to replace it."""
    user = factories.UserFactory()
    client = APIClient()
    client.force_login(user)
    document = factories.DocumentFactory(link_reach="restricted")
    factories.UserDocumentAccessFactory(document=document, user=user, role=role)

    response = client.put(
        f"/api/v1.0/documents/{document.id!s}/content/",
        {"content": "# Hello"},
        format="json",
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN
    mock_yhub.return_value.replace_ydoc.assert_not_called()


@pytest.mark.parametrize("role", ["editor", "administrator", "owner"])
def test_api_documents_content_success(role, mock_yhub, mock_convert):
    """
    Users who may edit a document should be able to replace its content, the
    markdown being converted and merged on the collaboration server as them.
    """
    user = factories.UserFactory()
    client = APIClient()
    client.force_login(user)
    document = factories.DocumentFactory(link_reach="restricted")
    factories.UserDocumentAccessFactory(document=document, user=user, role=role)

    response = client.put(
        f"/api/v1.0/documents/{document.id!s}/content/",
        {"content": "# Hello\n\nWorld"},
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"id": str(document.id)}
    mock_convert.assert_called_once_with(
        b"# Hello\n\nWorld", "text/markdown", "application/vnd.yjs.doc"
    )
    mock_yhub.assert_called_once_with(user=user)
    mock_yhub.return_value.replace_ydoc.assert_called_once_with(document, CONVERTED)


@pytest.mark.parametrize(
    "payload", [{}, {"content": ""}, {"content": "  \n"}, {"content": 3}]
)
def test_api_documents_content_blank(payload, mock_yhub):
    """Blank content should be refused rather than wipe the document."""
    user = factories.UserFactory()
    client = APIClient()
    client.force_login(user)
    document = factories.DocumentFactory(users=[(user, "owner")])

    response = client.put(
        f"/api/v1.0/documents/{document.id!s}/content/", payload, format="json"
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json() == {
        "content": ["This field is required and may not be blank."]
    }
    mock_yhub.return_value.replace_ydoc.assert_not_called()


def test_api_documents_content_invalid_markdown(mock_yhub, mock_convert):
    """Content the converter refuses should answer a 400 carrying its reason."""
    user = factories.UserFactory()
    client = APIClient()
    client.force_login(user)
    document = factories.DocumentFactory(users=[(user, "owner")])
    mock_convert.side_effect = YProviderValidationError("Invalid content")

    response = client.put(
        f"/api/v1.0/documents/{document.id!s}/content/",
        {"content": "# Hello"},
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json() == {"error": "Invalid content"}
    mock_yhub.return_value.replace_ydoc.assert_not_called()


def test_api_documents_content_converter_unavailable(mock_yhub, mock_convert):
    """A converter that cannot be reached should answer a 500."""
    user = factories.UserFactory()
    client = APIClient()
    client.force_login(user)
    document = factories.DocumentFactory(users=[(user, "owner")])
    mock_convert.side_effect = YProviderServiceUnavailableError("down")

    response = client.put(
        f"/api/v1.0/documents/{document.id!s}/content/",
        {"content": "# Hello"},
        format="json",
    )

    assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
    assert response.json() == {"error": "Failed to convert document content"}
    mock_yhub.return_value.replace_ydoc.assert_not_called()


def test_api_documents_content_yhub_unavailable(mock_yhub):
    """A collaboration server that cannot be reached should answer a 500."""
    user = factories.UserFactory()
    client = APIClient()
    client.force_login(user)
    document = factories.DocumentFactory(users=[(user, "owner")])
    mock_yhub.return_value.replace_ydoc.side_effect = YHubServiceUnavailableError(
        "down"
    )

    response = client.put(
        f"/api/v1.0/documents/{document.id!s}/content/",
        {"content": "# Hello"},
        format="json",
    )

    assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
    assert response.json() == {"error": "Failed to save document content"}
