# Copyright (c) 2026 Uno Kim / AMEVA Foundation. All rights reserved.
# SPDX-License-Identifier: Apache-2.0 OR Commercial-License
"""
GPU requests must stop with the shared AMU_ERR_RUNTIME_REQUIRED explanation when
ameva-runtime (AMUDA) is missing or too old. The CPU is never a silent fallback.
The runtime is simulated; no GPU and no real ameva-runtime are needed.
"""
import sys
from unittest.mock import patch

import pytest

import termux_bitnet.cli as cli_main_module
from termux_bitnet import hardware
from termux_bitnet.exceptions import PlatformNotSupportedError, RuntimeRequiredError


def _runtime(version):
    return patch("ameva_device.runtime_guard.installed_runtime_version", return_value=version)


@pytest.mark.parametrize("device", ["gpu", "vulkan"])
def test_explicit_gpu_without_runtime_stops(device):
    with _runtime(None):
        with pytest.raises(RuntimeRequiredError) as info:
            hardware.resolve_device_backend(device)
    text = str(info.value)
    assert isinstance(info.value, PlatformNotSupportedError)
    assert "[AMU_ERR_RUNTIME_REQUIRED] termux-bitnet:" in text
    assert "not installed" in text
    assert "no CPU fallback was used" in text
    assert "AMUDA" in text
    assert 'pip install "ameva-runtime>=2.0.0"' in text
    assert "npm install -g @ameva/runtime" in text
    assert "https://github.com/uno-km/ameva-runtime-releases" in text
    assert "--device cpu" in text


def test_old_runtime_is_rejected():
    with _runtime("1.9.0"):
        with pytest.raises(RuntimeRequiredError) as info:
            hardware.resolve_device_backend("gpu")
    assert "1.9.0 is installed, but >= 2.0.0 is required" in str(info.value)


def test_cpu_never_touches_the_guard():
    with patch.object(hardware, "_require_gpu_runtime", side_effect=AssertionError("guard called")):
        result = hardware.resolve_device_backend("cpu")
    assert result[0] == "cpu"


def test_missing_sdk_is_an_explicit_error_not_a_fallback():
    with patch.dict(sys.modules, {"ameva_device": None}):
        with pytest.raises(RuntimeRequiredError) as info:
            hardware.resolve_device_backend("gpu")
    assert "ameva-device-sdk" in str(info.value)
    assert "no CPU fallback was used" in str(info.value)


def test_cli_exits_69_with_explanation_on_stderr(capsys):
    err = RuntimeRequiredError("[AMU_ERR_RUNTIME_REQUIRED] termux-bitnet: test")
    with patch.object(cli_main_module, "_main_impl", side_effect=err):
        code = cli_main_module.main()
    captured = capsys.readouterr()
    assert code == 69
    assert captured.out == ""
    assert "AMU_ERR_RUNTIME_REQUIRED" in captured.err


def test_cli_passes_normal_results_through():
    with patch.object(cli_main_module, "_main_impl", return_value=0):
        assert cli_main_module.main() == 0
