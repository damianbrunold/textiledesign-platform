class User:
    @classmethod
    def from_row(cls, row):
        result = User()
        result.name = row.name
        result.label = row.label
        result.email = row.email
        result.password = row.password
        result.darkmode = row.darkmode
        result.verified = row.verified
        result.disabled = row.disabled
        result.locale = row.locale
        result.timezone = row.timezone
        return result


class Pattern:
    @classmethod
    def from_row(cls, row):
        result = Pattern()
        result.name = row.name
        result.label = row.label
        result.owner = row.owner
        result.pattern_type = row.pattern_type
        result.description = row.description
        result.contents = row.contents
        result.preview_image = row.preview_image
        result.thumbnail_image = row.thumbnail_image
        result.created = row.created
        result.modified = row.modified
        result.public = row.public
        return result
