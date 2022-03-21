import datetime
import os
import re

from flask import current_app

class User:
    @classmethod
    def from_row(cls, row):
        result = User()
        result.id = row.id
        result.name = row.name
        result.email = row.email
        result.password = row.password
        result.darkmode = row.darkmode
        result.verified = row.verified
        result.disabled = row.disabled
        return result

