#!/bin/bash
# GTM CLI Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/owntag/gtm-cli/main/install.sh | bash

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# GTM CLI blue
GTM_BLUE='\033[38;2;0;51;153m'

print_banner() {
    echo -e "${GTM_BLUE}"
    echo '  ██████╗ ████████╗███╗   ███╗     ██████╗██╗     ██╗'
    echo ' ██╔════╝ ╚══██╔══╝████╗ ████║    ██╔════╝██║     ██║'
    echo ' ██║  ███╗   ██║   ██╔████╔██║    ██║     ██║     ██║'
    echo ' ██║   ██║   ██║   ██║╚██╔╝██║    ██║     ██║     ██║'
    echo ' ╚██████╔╝   ██║   ██║ ╚═╝ ██║    ╚██████╗███████╗██║'
    echo '  ╚═════╝    ╚═╝   ╚═╝     ╚═╝     ╚═════╝╚══════╝╚═╝'
    echo -e "${NC}"
    echo ""
}

info() {
    echo -e "${BLUE}▶${NC} $1"
}

success() {
    echo -e "${GREEN}✓${NC} $1"
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

error() {
    echo -e "${RED}✗${NC} $1"
    exit 1
}

# Detect OS
detect_os() {
    case "$(uname -s)" in
        Linux*)     echo "linux" ;;
        Darwin*)    echo "darwin" ;;
        MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
        *)          error "Unsupported operating system: $(uname -s)" ;;
    esac
}

# Detect architecture
detect_arch() {
    case "$(uname -m)" in
        x86_64|amd64)   echo "x64" ;;
        arm64|aarch64)  echo "arm64" ;;
        *)              error "Unsupported architecture: $(uname -m)" ;;
    esac
}

# Get latest release version from GitHub
get_latest_version() {
    curl -fsSL "https://api.github.com/repos/owntag/gtm-cli/releases/latest" 2>/dev/null | \
        grep '"tag_name":' | \
        sed -E 's/.*"([^"]+)".*/\1/' || echo ""
}

# Format bytes to human readable
format_bytes() {
    local bytes=$1
    if [ "$bytes" -ge 1073741824 ]; then
        echo "$((bytes / 1073741824)) GB"
    elif [ "$bytes" -ge 1048576 ]; then
        echo "$((bytes / 1048576)) MB"
    elif [ "$bytes" -ge 1024 ]; then
        echo "$((bytes / 1024)) KB"
    else
        echo "${bytes} bytes"
    fi
}

# Main installation
main() {
    print_banner
    
    info "Installing GTM CLI..."
    echo ""
    
    # Detect platform
    OS=$(detect_os)
    ARCH=$(detect_arch)
    
    info "Detected platform: ${OS}-${ARCH}"
    
    # Get latest version
    VERSION=$(get_latest_version)
    
    if [ -z "$VERSION" ]; then
        error "Could not determine latest version. Please check https://github.com/owntag/gtm-cli/releases"
    fi
    
    info "Latest version: ${VERSION}"
    
    # Build download URL
    BINARY_NAME="gtm-${OS}-${ARCH}"
    if [ "$OS" = "windows" ]; then
        BINARY_NAME="${BINARY_NAME}.exe"
    fi
    
    DOWNLOAD_URL="https://github.com/owntag/gtm-cli/releases/download/${VERSION}/${BINARY_NAME}"
    
    # Determine install location
    if [ -w "/usr/local/bin" ]; then
        INSTALL_DIR="/usr/local/bin"
    else
        INSTALL_DIR="$HOME/.local/bin"
        mkdir -p "$INSTALL_DIR"
    fi
    
    INSTALL_PATH="${INSTALL_DIR}/gtm"
    if [ "$OS" = "windows" ]; then
        INSTALL_PATH="${INSTALL_DIR}/gtm.exe"
    fi
    
    # Get file size for progress display
    FILE_SIZE=$(curl -sI -L "$DOWNLOAD_URL" 2>/dev/null | grep -i content-length | tail -1 | awk '{print $2}' | tr -d '\r')
    if [ -n "$FILE_SIZE" ] && [ "$FILE_SIZE" -gt 0 ] 2>/dev/null; then
        SIZE_DISPLAY=$(format_bytes "$FILE_SIZE")
        info "Downloading ${BINARY_NAME} (${SIZE_DISPLAY})..."
    else
        info "Downloading ${BINARY_NAME}..."
    fi
    
    echo ""
    
    # Download binary with progress
    if command -v curl &> /dev/null; then
        # Use curl with progress bar (shows %, total, received, speed, time)
        if ! curl -fL --progress-bar -o "${INSTALL_PATH}.tmp" "$DOWNLOAD_URL"; then
            rm -f "${INSTALL_PATH}.tmp"
            error "Download failed. The release for ${OS}-${ARCH} might not be available yet."
        fi
    elif command -v wget &> /dev/null; then
        # Use wget with progress bar
        if ! wget --show-progress -q -O "${INSTALL_PATH}.tmp" "$DOWNLOAD_URL"; then
            rm -f "${INSTALL_PATH}.tmp"
            error "Download failed. The release for ${OS}-${ARCH} might not be available yet."
        fi
    else
        error "Neither curl nor wget found. Please install one of them."
    fi
    
    echo ""
    
    # Move to final location
    mv "${INSTALL_PATH}.tmp" "$INSTALL_PATH"
    chmod +x "$INSTALL_PATH"
    
    success "Installed to: ${INSTALL_PATH}"
    
    # Check if install dir is in PATH
    if [[ ":$PATH:" != *":${INSTALL_DIR}:"* ]]; then
        echo ""
        warn "Installation directory is not in your PATH."
        echo ""
        echo "Add this to your shell profile (~/.bashrc, ~/.zshrc, etc.):"
        echo ""
        echo -e "  ${BLUE}export PATH=\"\$PATH:${INSTALL_DIR}\"${NC}"
        echo ""
    fi
    
    # Verify installation
    echo ""
    if command -v gtm &> /dev/null; then
        success "GTM CLI installed successfully!"
        echo ""
        echo "Get started:"
        echo "  gtm auth login     # Authenticate with Google"
        echo "  gtm accounts list  # List your GTM accounts"
        echo "  gtm --help         # See all commands"
    else
        success "GTM CLI downloaded successfully!"
        echo ""
        echo "Run this command to get started:"
        echo "  ${INSTALL_PATH} auth login"
    fi
    
    echo ""
}

main "$@"
