// api/IntentController.java
package com.evocode.controlplane.api;

import com.evocode.controlplane.auth.AuthPrincipal;
import com.evocode.controlplane.client.PythonRuntimeClient;
import com.evocode.controlplane.dto.IntentRequest;
import com.evocode.controlplane.dto.RunResult;
import com.evocode.controlplane.persistence.RunStore;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/intents")
public class IntentController {

    private final PythonRuntimeClient runtimeClient;
    private final RunStore runStore;

    public IntentController(PythonRuntimeClient runtimeClient, RunStore runStore) {
        this.runtimeClient = runtimeClient;
        this.runStore = runStore;
    }

    @PostMapping
    public RunResult submit(@Valid @RequestBody IntentRequest request,
                            @AuthenticationPrincipal AuthPrincipal me) {
        RunResult result = runtimeClient.createRun(request);
        runStore.save(request, result, me.userId());  // 旁路持久化（记属主）；save 内部已吞异常
        return result;
    }
}
