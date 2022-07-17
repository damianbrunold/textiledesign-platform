from setuptools import find_packages, setup

setup(
    name='textileplatform',
    version='0.0.28',
    packages=find_packages(),
    include_package_data=True,
    zip_safe=False,
    install_requires=[
        'flask',
        'flask-babel',
        'pg8000',
        'SQLAlchemy',
        'reportlab',
        'Pillow'
    ],
)
