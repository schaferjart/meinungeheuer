#!/bin/bash
# Run this on the Pi to install and enable both services.
# Usage: bash setup-pi-services.sh

set -e

echo "Installing printer-bridge service..."
sudo cp apps/printer-bridge/printer-bridge.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable printer-bridge
sudo systemctl start printer-bridge

echo "Installing pos-server service..."
sudo cp apps/pos-server/pos-server.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable pos-server
sudo systemctl start pos-server

echo ""
echo "Done! Both services are running and will auto-start on reboot."
echo ""
echo "Useful commands:"
echo "  sudo systemctl status printer-bridge    # check bridge status"
echo "  sudo systemctl status pos-server        # check POS status"
echo "  sudo journalctl -u printer-bridge -f    # follow bridge logs"
echo "  sudo journalctl -u pos-server -f        # follow POS logs"
echo "  sudo systemctl restart printer-bridge   # restart bridge"
echo "  sudo systemctl restart pos-server       # restart POS"
