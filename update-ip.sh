#!/bin/bash
IP=$(hostname -I | awk '{print $1}')
sed -i "s/http:\/\/[0-9]\{1,3\}\.[0-9]\{1,3\}\.[0-9]\{1,3\}\.[0-9]\{1,3\}:5000/http:\/\/$IP:5000/g" /path/to/your/frontend/code/*.js
echo "IP updated to $IP"
