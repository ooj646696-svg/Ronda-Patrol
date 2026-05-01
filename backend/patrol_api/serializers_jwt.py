"""Custom JWT claims: role and branch_id for frontend."""
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer


class RondaTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['username'] = user.username
        token['role'] = user.role
        token['branch_id'] = user.branch_id

        # Safely get branch name - handle cases where branch isn't loaded or doesn't exist
        branch_name = None
        if user.branch_id:
            try:
                # Try to get branch name from the related object if already loaded
                if hasattr(user, '_prefetched_objects_cache') and 'branch' in user._prefetched_objects_cache:
                    branch_name = user.branch.name if user.branch else None
                else:
                    # Query the Branch model directly to avoid lazy loading issues
                    from .models import Branch
                    branch = Branch.objects.filter(id=user.branch_id).first()
                    branch_name = branch.name if branch else None
            except Exception:
                # Fallback to None if any error occurs
                branch_name = None

        token['branch_name'] = branch_name
        token['user_id'] = user.id
        return token
