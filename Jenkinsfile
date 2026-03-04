@Library('devop_itp_share_library@master') _

pipeline {
    agent any

    environment {
        REPO_NAME  = 'your-dockerhub-username'   // 🔁 Change this
        IMAGE_NAME = 'jenkins-itp-nextjs'
        TAG        = 'latest'
        CONTAINER_NAME = 'nextjs-app'
        PORT       = '3000'
    }

    stages {

        // 1️⃣ Clone Next.js Code
        stage('Clone Code') {
            steps {
                git 'https://github.com/seang454/frontend-docuhub'  // 🔁 Change this
            }
        }

        // 2️⃣ Install Dependencies & Run Tests
        stage('Install & Test') {
            steps {
                script {
                    if (fileExists('package.json')) {
                        sh '''
                        npm ci
                        npm run test --if-present
                        '''
                    } else {
                        error "No package.json found — is this a Next.js project?"
                    }
                }
            }
        }

        // 3️⃣ Prepare Dockerfile
        stage('Prepare Dockerfile') {
            steps {
                script {
                    def sharedDockerfile = libraryResource 'next/dev.Dockerfile'
                    def dockerfilePath = 'Dockerfile'

                    if (fileExists(dockerfilePath)) {
                        def existingDockerfile = readFile(dockerfilePath)
                        if (existingDockerfile != sharedDockerfile) {
                            echo 'Dockerfile differs from shared library. Replacing it.'
                            sh "rm -f ${dockerfilePath}"
                            writeFile file: dockerfilePath, text: sharedDockerfile
                        } else {
                            echo 'Dockerfile is already up-to-date.'
                        }
                    } else {
                        echo 'Dockerfile not found. Creating from shared library.'
                        writeFile file: dockerfilePath, text: sharedDockerfile
                    }
                }
            }
        }

        // 4️⃣ Build Docker Image
        stage('Build Image') {
            steps {
                sh 'docker build --no-cache -t ${REPO_NAME}/${IMAGE_NAME}:${TAG} .'
            }
        }

        // 5️⃣ Ensure Docker Hub Repo Exists
        stage('Ensure Docker Hub Repo Exists') {
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'DOCKERHUB-CREDENTIAL',
                    usernameVariable: 'DH_USERNAME',
                    passwordVariable: 'DH_PASSWORD'
                )]) {
                    sh '''
                    STATUS=$(curl -s -o /dev/null -w "%{http_code}" -u "$DH_USERNAME:$DH_PASSWORD" \
                      https://hub.docker.com/v2/repositories/$REPO_NAME/$IMAGE_NAME/)

                    if [ "$STATUS" -eq 404 ]; then
                      curl -s -u "$DH_USERNAME:$DH_PASSWORD" -X POST \
                        https://hub.docker.com/v2/repositories/ \
                        -H "Content-Type: application/json" \
                        -d "{\"name\":\"$IMAGE_NAME\",\"is_private\":false}"
                    fi
                    '''
                }
            }
        }

        // 6️⃣ Push Docker Image
        stage('Push Image') {
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'DOCKERHUB-CREDENTIAL',
                    usernameVariable: 'DH_USERNAME',
                    passwordVariable: 'DH_PASSWORD'
                )]) {
                    sh '''
                    echo "$DH_PASSWORD" | docker login -u "$DH_USERNAME" --password-stdin
                    docker push ${REPO_NAME}/${IMAGE_NAME}:${TAG}
                    docker logout
                    '''
                }
            }
        }

    post {
        success {
            echo "🚀 Build & deploy successful: ${REPO_NAME}/${IMAGE_NAME}:${TAG}"
        }
        failure {
            echo "❌ Pipeline failed. Check logs above."
        }
        always {
            sh 'docker image prune -f || true'
        }
    }
}