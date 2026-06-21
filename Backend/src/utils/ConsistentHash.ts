import crypto from "crypto";



export class ConsistentHash {
    private ring: Map<number, string> = new Map();
    private keys: number[] = [];
    private replicas: number = 100;

    private hash(str : string) : number {
        const hashStr = crypto.createHash('md5').update(str).digest('hex')
        return parseInt(hashStr.substring(0,8), 16);
    }

    public addNode(node : string){
        for(let i = 0 ; i < this.replicas;i++){
            const virtualNodeKey = this.hash(`${node}:${i}`);
            this.ring.set(virtualNodeKey,node);
            this.keys.push(virtualNodeKey);
        }
        this.keys.sort((a,b)=>a-b);
    }

    constructor(nodes : string[],replicas = 100){
        this.replicas = replicas;
        for (const node of nodes){
            this.addNode(node);
        }
    }
    public getNode(key:string) : string | null{
        if(this.keys.length == 0) return null;

        const hashVal  = this.hash(key);
        let left = 0;
        let right = this.keys.length -1;
        if(hashVal > this.keys[right]){
            return this.ring.get(this.keys[0])!;
        }
        while(left <= right){
            const mid =  Math.floor((left + right)/2);
            if(this.keys[mid] >= hashVal){
                if(mid == 0 || this.keys[mid -1] < hashVal){
                   return this.ring.get(this.keys[mid])!;
                }
                right = mid -1;
            }
            else {
                left = mid + 1;
            }


        }
        return this.ring.get(this.keys[0])!;
    }

}
