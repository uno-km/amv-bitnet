# Copyright (c) 2026 Uno Kim / AMEVA Foundation. All rights reserved.
# SPDX-License-Identifier: Apache-2.0 OR Commercial-License
from setuptools import setup, find_packages

setup(
    name="amv-bitnet",
    version="3.0.3",
    packages=find_packages(),
    install_requires=[
        "requests>=2.28.0",
        "amv-runtime>=2.9.0",
        "amv-component-sdk>=0.1.0,<2.0",
    ],
    entry_points={
        "console_scripts": [
            "amv-bitnet = amv_bitnet.cli:main",
        ],
        "ameva.components": [
            "amv-bitnet = amv_bitnet.adapter:create_adapter",
        ],
    },
)
