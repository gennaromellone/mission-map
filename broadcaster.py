from socket import *
import datetime
import time

# Version 1.3

# 12222 = GPS
# 12223 = ECOSCANDAGLIO
# 12224 = IMU

class MsgReceiver:
    def __init__(self, ip='255.255.255.255', port=12224, d_port=12223, gps_port=12225):
        self.ip = ip
        self.port = port
        self.d_port = d_port
        self.gps_port = gps_port
        
    def getGPS(self, output_path=""):
        mission_date = datetime.datetime.now().strftime('%d%m%YZ%H%M')
        if output_path != "":
            project_name = "gps_raw.txt"
            write_file = open(output_path, 'a')

        cli = socket(AF_INET, SOCK_DGRAM)
        cli.settimeout(5)
        cli.setsockopt(SOL_SOCKET, SO_BROADCAST, 1)
        cli.bind((self.ip, self.gps_port))
        message = cli.recvfrom(1024)
        #print(message)

        if output_path != "":
            write_file.write(str(mission_date) + '\n')
            write_file.write(str(message) + '\n')
            write_file.close()
        
        
        return message
        
    def getDepth(self, output_path=""):
        mission_date = datetime.datetime.now().strftime('%d%m%YZ%H%M')
        if output_path != "":
            project_name = "echo_raw.txt"
            write_file = open(output_path, 'a')

        cli = socket(AF_INET, SOCK_DGRAM)
        cli.settimeout(2)
        cli.setsockopt(SOL_SOCKET, SO_BROADCAST, 1)
        cli.bind((self.ip, self.d_port))
        message = cli.recvfrom(1024)

        if output_path != "":
            write_file.write(str(mission_date) + '\n')
            write_file.write(str(message) + '\n')
            write_file.close()

        try:
            message = str(message[0]).replace("b'","")
            messages = message.split(' ')
            if len(messages) > 0 and 'M' in messages[4] and messages[5] != "0.'":
                
                return messages[5]
            else:
                return 0.0
        except:
            return 0.0
        
    def getMessage(self, output_path="", simulate=False):
        mission_date = datetime.datetime.now().strftime('%d%m%YZ%H%M')
        if output_path != "":
            project_name = "imu_raw.txt"
            write_file = open('/home/pi/Desktop/Broadcaster/raw/'+project_name, 'a')

        brk_msg = True
        fields = []
        # Check if is not simulation mode
        if not simulate:
            cli = socket(AF_INET, SOCK_DGRAM)
            cli.settimeout(1)
            cli.setsockopt(SOL_SOCKET, SO_BROADCAST, 1)
            #print("HERE")
            cli.bind((self.ip, self.port))
            message = cli.recvfrom(1024)
            
            if output_path != "":
                write_file.write(str(mission_date) + '\n')
                write_file.write(str(message) + '\n')
                write_file.close()
            # Message parsing
            message = str(message[0]).replace("b'", "")
            messages = message.split('*\\r\\n')
            #print(message)

            for message in messages:
                fields = message.split(";")
                if len(fields) == 11:
                    brk_msg = False
                    break

        else:
            #message = "b'$GGLV;0.0;0.0;0.0;0.0;0.021;4.48;-0.59;296.27;0;*\r\n$GGLV;;;;;;3.57;-0.98;133.45;0;*\r\n$GGLV;;;;;;3.53;-1.09;133.41;0;*\r\n$GGLV;;;;;;3.57;-1.14;134.05;0;*\r\n$GGLV;;;;;;3.52;-1.04;134.14;0;*\r\n'"
            message = "b'$GGLV;4051.42160;01417.05283;0.0;0.021;4.48;-0.59;296.27;0;*\r\n$GGLV;;;;3.57;-0.98;133.45;0;*\r\n$GGLV;;;;3.53;-1.09;133.41;0;*\r\n$GGLV;;;;3.57;-1.14;134.05;0;*\r\n$GGLV;;;;3.52;-1.04;134.14;0;*\r\n'"

            messages = str(message).replace("b'","")
            messages = messages.split('*\r\n')
            for message in messages:
                fields = message.split(";")
                if len(fields) == 11:
                    brk_msg = False
                    break
        if not brk_msg:
            if fields[1] == '':
                myTime = 0.0
            else:
                myTime = float(fields[1])
                
            if fields[2] == '':
                mLatGPS = 0.0
            else:
                print(fields[2])
                mLatGPS = float(fields[2])
            
            if fields[3] == '':
                mLonGPS = 0.0
            else:
                mLonGPS = float(fields[3])
            
            if fields[4] == '':
                mTrackGPS = 0.0
            else:
                mTrackGPS = float(fields[4])
                
            if fields[5] == '':
                mVelGPS = 0.0
            else:
                mVelGPS = float(fields[5])
                
            if fields[6] == '':
                mRollIMU = 0.0
            else:
                mRollIMU = float(fields[6])
            if fields[7] == '':
                mPitchIMU = 0.0
            else:
                mPitchIMU = float(fields[7])
            if fields[8] == '':
                mHeadingIMU = 0.0
            else:
                mHeadingIMU = float(fields[8])
            
            if fields[9] == '':
                mFixBuzzer = 0
            else:
                mFixBuzzer = int(fields[9])
                
                
            
            return {
                "myTime":myTime,
                "mLatGPS":mLatGPS,
                "mLonGPS":mLonGPS,
                "mTrackGPS":mTrackGPS,
                "mVelGPS":mVelGPS,
                "mRollIMU":mRollIMU,
                "mPitchIMU":mPitchIMU,
                "mHeadingIMU":mHeadingIMU,
                "mFixBuzzer":mFixBuzzer,
                }
        else:
            # If can't find a good packet, return empty data
            return {
                "myTime":0.0,
                "mLatGPS":0.0,
                "mLonGPS":0.0,
                "mTrackGPS":0.0,
                "mVelGPS":0.0,
                "mRollIMU":0.0,
                "mPitchIMU":0.0,
                "mHeadingIMU":0.0,
                "mFixBuzzer":-1
                }

