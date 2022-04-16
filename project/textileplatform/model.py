import datetime
import os
import re

from flask import current_app
from flask_babel import gettext

TYPE_DBWEAVE_PATTERN = 0
TYPE_JBEAD_PATTERN = 1
TYPE_GENERIC_IMAGE = 2


def get_type_label(type_id):
    if type_id == TYPE_DBWEAVE_PATTERN:
        return gettext("DB-WEAVE Pattern")
    elif type_id == TYPE_JBEAD_PATTERN:
        return gettext("JBEAD Pattern")
    elif type_id == TYPE_GENERIC_IMAGE:
        return gettext("Generic Image")
    else:
        return gettext("Unknown Pattern Type")


class User:
    @classmethod
    def from_row(cls, row):
        result = User()
        result.id = row.id
        result.display = row.display
        result.name = row.name
        result.email = row.email
        result.password = row.password
        result.darkmode = row.darkmode
        result.verified = row.verified
        result.disabled = row.disabled
        result.locale = row.locale
        result.timezone = row.timezone
        return result


class Document:
    @classmethod
    def from_row(cls, row):
        result = Document()
        result.id = row.id
        result.owner_id = row.owner_id
        result.type_id = row.type_id
        result.name = row.name
        result.description = row.description
        result.contents = row.contents
        result.preview_image = row.preview_image
        result.thumbnail_image = row.thumbnail_image
        result.created = row.created
        result.modified = row.modified
        result.public = row.public
        return result

    def type_label(self):
        if self.type_id == 0:
            return gettext("DB-WEAVE Pattern")
        elif self.type_id == 1:
            return gettext("JBEAD Pattern")
        elif self.type_id == 2:
            return gettext("Generic Image")
        else:
            return gettext("Unknown Type")

