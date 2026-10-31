"""Per-user activity counters: distinct days accessed (total / this year)
and the last access time, shown in /admin/users."""
import datetime

from textileplatform.db import db
from textileplatform.models import User, record_access

from test_patterns import _login, _make_user

UTC = datetime.UTC


def _at(y, m, d, h=12, minute=0):
    return datetime.datetime(y, m, d, h, minute, tzinfo=UTC)


def _yesterday():
    """Within the session lifetime (an older last access logs out)."""
    return datetime.datetime.now(UTC) - datetime.timedelta(days=1)


def _counts(user_id):
    db.session.expire_all()
    u = db.session.get(User, user_id)
    return u.usage_days_year, u.usage_days_total, u.usage_year


def _set_last_access(user, when):
    user.access_date = when
    user.usage_year = when.year
    user.usage_days_year = 5
    user.usage_days_total = 9
    db.session.commit()


class TestRecordAccess:
    def test_counts_a_new_day_once_for_concurrent_requests(self, app):
        """A page load fires many requests at once (page, thumbnails,
        API). Each one loaded the user before any of them stored the
        new access time, so each believes it is the first request of
        the day. The day must still count once."""
        user = _make_user()
        _set_last_access(user, _at(2026, 3, 1))
        now = _at(2026, 3, 2, 8)
        for k in range(5):
            record_access(user.id, now + datetime.timedelta(seconds=k))
        db.session.commit()
        assert _counts(user.id) == (6, 10, 2026)

    def test_same_day_only_moves_the_access_time(self, app):
        user = _make_user()
        _set_last_access(user, _at(2026, 3, 1, 8))
        record_access(user.id, _at(2026, 3, 1, 9))
        db.session.commit()
        assert _counts(user.id) == (5, 9, 2026)
        assert db.session.get(User, user.id).access_date.replace(
            tzinfo=UTC) == _at(2026, 3, 1, 9)

    def test_a_late_request_does_not_move_the_access_time_back(self, app):
        user = _make_user()
        _set_last_access(user, _at(2026, 3, 1, 9))
        record_access(user.id, _at(2026, 3, 1, 8))
        db.session.commit()
        assert db.session.get(User, user.id).access_date.replace(
            tzinfo=UTC) == _at(2026, 3, 1, 9)

    def test_days_are_utc_days(self, app):
        user = _make_user()
        _set_last_access(user, _at(2026, 3, 1, 23, 50))
        record_access(user.id, _at(2026, 3, 2, 0, 10))
        db.session.commit()
        assert _counts(user.id) == (6, 10, 2026)

    def test_a_new_year_restarts_the_year_count(self, app):
        user = _make_user()
        _set_last_access(user, _at(2025, 12, 31))
        record_access(user.id, _at(2026, 1, 1))
        db.session.commit()
        assert _counts(user.id) == (1, 10, 2026)

    def test_first_access_ever(self, app):
        user = _make_user()
        record_access(user.id, _at(2026, 3, 1))
        db.session.commit()
        assert _counts(user.id) == (1, 1, 2026)


class TestRequestTracking:
    def test_static_files_do_not_touch_the_counters(
            self, app, csrf_disabled_client):
        client = csrf_disabled_client
        user = _make_user()
        _login(client)
        yesterday = _yesterday()
        _set_last_access(user, yesterday)
        r = client.get("/static/css/style.css")
        assert r.status_code in (200, 304)
        assert _counts(user.id) == (5, 9, yesterday.year)

    def test_a_page_on_a_new_day_counts_it(self, app, csrf_disabled_client):
        client = csrf_disabled_client
        user = _make_user()
        _login(client)
        yesterday = _yesterday()
        _set_last_access(user, yesterday)
        assert client.get("/alice").status_code == 200
        assert client.get("/alice").status_code == 200
        year = datetime.datetime.now(UTC).year
        # Yesterday's year count (5) goes on, unless the year changed.
        assert _counts(user.id) == (
            6 if year == yesterday.year else 1, 10, year)
