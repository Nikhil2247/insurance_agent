"""Test script to verify the installation and data loading."""

import os
import sys
from pathlib import Path

# Add current directory to path
sys.path.insert(0, str(Path(__file__).parent))


def test_data_loading():
    """Test that data loads correctly."""
    print("Testing data loading...")

    from api.data_loader import get_data_loader

    loader = get_data_loader()

    # Test appetite data
    appetite = loader.appetite
    print(f"  Appetite records: {len(appetite)}")
    assert len(appetite) > 10000, "Expected 10000+ appetite records"

    # Test rules
    rules = loader.rules
    print(f"  Rules: {len(rules)}")
    assert len(rules) > 800, "Expected 800+ rules"

    # Test carriers
    carriers = loader.get_unique_carriers()
    print(f"  Unique carriers: {len(carriers)}")
    assert len(carriers) > 100, "Expected 100+ carriers"

    # Test LOBs
    lobs = loader.get_unique_lobs()
    print(f"  Unique LOBs: {len(lobs)}")
    assert len(lobs) > 50, "Expected 50+ LOBs"

    print("  Data loading: PASSED")
    return True


def test_carrier_search():
    """Test carrier search functionality."""
    print("Testing carrier search...")

    from api.data_loader import get_data_loader

    loader = get_data_loader()

    # Search by LOB
    home_carriers = loader.search_carriers_by_lob("Home")
    print(f"  Carriers for Home: {len(home_carriers)}")
    assert len(home_carriers) > 0, "Expected some home carriers"

    # Search by state
    tx_carriers = loader.search_carriers_by_state("TX")
    print(f"  Carriers in TX: {len(tx_carriers)}")
    assert len(tx_carriers) > 0, "Expected some TX carriers"

    print("  Carrier search: PASSED")
    return True


def test_tools():
    """Test agent tools."""
    print("Testing agent tools...")

    from api.tools.carrier_tools import search_carriers, get_carrier_details

    # Test search
    result = search_carriers.invoke({"state": "TX", "lob": "Home", "limit": 5})
    print(f"  Search result: {result[:100]}...")
    assert "carriers" in result, "Expected carriers in result"

    print("  Agent tools: PASSED")
    return True


def test_env():
    """Test environment configuration."""
    print("Testing environment...")

    from dotenv import load_dotenv

    env_path = Path(__file__).parent / ".env"

    if not env_path.exists():
        print("  WARNING: .env file not found")
        print("  Create .env with your OPENROUTER_API_KEY")
        return False

    load_dotenv(env_path)

    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key or api_key == "your_openrouter_api_key_here":
        print("  WARNING: OPENROUTER_API_KEY not set")
        return False

    print("  Environment: PASSED")
    return True


def main():
    """Run all tests."""
    print("=" * 50)
    print("AI Insurance Agent - Setup Test")
    print("=" * 50)
    print()

    all_passed = True

    # Test data loading
    try:
        if not test_data_loading():
            all_passed = False
    except Exception as e:
        print(f"  Data loading: FAILED - {e}")
        all_passed = False

    print()

    # Test carrier search
    try:
        if not test_carrier_search():
            all_passed = False
    except Exception as e:
        print(f"  Carrier search: FAILED - {e}")
        all_passed = False

    print()

    # Test tools
    try:
        if not test_tools():
            all_passed = False
    except Exception as e:
        print(f"  Agent tools: FAILED - {e}")
        all_passed = False

    print()

    # Test environment
    try:
        if not test_env():
            all_passed = False
    except Exception as e:
        print(f"  Environment: FAILED - {e}")
        all_passed = False

    print()
    print("=" * 50)

    if all_passed:
        print("All tests PASSED!")
        print()
        print("Next steps:")
        print("  1. Create .env file with your OPENROUTER_API_KEY")
        print("  2. Run: python run_chat.py")
    else:
        print("Some tests FAILED - check above for details")

    print("=" * 50)

    return all_passed


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
