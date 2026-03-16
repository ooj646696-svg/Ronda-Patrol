"""
JWT auth for Django Channels WebSockets.

Mobile/web clients connect with:
  ws://<host>/ws/call/?token=<JWT_ACCESS_TOKEN>
"""

from __future__ import annotations

from urllib.parse import parse_qs

from channels.middleware import BaseMiddleware
from django.contrib.auth.models import AnonymousUser
from django.db import close_old_connections
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import UntypedToken


@staticmethod
def _get_token_from_scope(scope) -> str | None:
    query_string = scope.get("query_string", b"").decode("utf-8")
    params = parse_qs(query_string)
    token = params.get("token", [None])[0]
    return token


class JwtAuthMiddleware(BaseMiddleware):
    """
    Populate scope['user'] from JWT access token (query param `token`).
    Falls back to AnonymousUser when missing/invalid.
    """

    async def __call__(self, scope, receive, send):
        close_old_connections()
        token = _get_token_from_scope(scope)
        scope["user"] = await self._get_user(token)
        return await super().__call__(scope, receive, send)

    @staticmethod
    async def _get_user(token: str | None):
        if not token:
            return AnonymousUser()
        try:
            validated = UntypedToken(token)
        except (InvalidToken, TokenError):
            return AnonymousUser()

        user_id = validated.payload.get("user_id") or validated.payload.get("id")
        if not user_id:
            return AnonymousUser()

        User = get_user_model()
        try:
            return await User.objects.aget(id=user_id)
        except User.DoesNotExist:
            return AnonymousUser()


def JwtAuthMiddlewareStack(inner):
    return JwtAuthMiddleware(inner)

